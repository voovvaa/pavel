import OpenAI from "openai";
import { config } from "../core/config.js";
import { Logger } from "../utils/logger.js";
import { BotPersonality, ChatContext, MemoryContext } from "../core/types.js";
import { UserProfiler, UserProfile } from "../analysis/user-profiler.js";

export class AIEngine {
  private openai: OpenAI | null = null;
  private personality: BotPersonality;
  private isEnabled: boolean;
  private profiler: UserProfiler | null = null;

  constructor(personality: BotPersonality, chatId?: string) {
    this.personality = personality;
    this.isEnabled = config.aiMode !== "patterns_only" && !!config.openaiApiKey;
    
    // Инициализируем профайлер если передан chatId
    if (chatId) {
      this.profiler = new UserProfiler(chatId);
      Logger.info('👤 Профайлер пользователей активирован');
    }

    if (this.isEnabled) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
      Logger.info(`🤖 AI движок активирован (модель: ${config.openaiModel})`);
    } else {
      Logger.info("🔧 AI движок отключен - используются только паттерны");
    }
  }

  /**
   * Упрощенный расчет токенов - только для non-reasoning моделей
   */
  private calculateMaxTokens(): number {
    const baseLength = this.personality.responseStyle.averageLength;
    
    if (config.openaiModel === 'gpt-5-nano') {
      // GPT-5 nano нужно больше токенов для reasoning + ответ
      const multiplier = 12;
      return Math.max(500, Math.min(2000, Math.round(baseLength * multiplier)));
    } else if (config.openaiModel === 'gpt-5-chat-latest') {
      // GPT-5-chat-latest - премиум модель, больше токенов для качественных ответов
      const multiplier = 8;
      return Math.max(800, Math.min(3000, Math.round(baseLength * multiplier)));
    } else {
      // Остальные модели
      const multiplier = 3;
      return Math.max(300, Math.min(1200, Math.round(baseLength * multiplier)));
    }
  }

  /**
   * Убрать все reasoning/verbosity логику
   */
  async generateResponse(
    messageText: string,
    author: string,
    context: ChatContext
  ): Promise<string | null> {
    if (!this.isEnabled) {
      Logger.debug("AI движок отключен");
      return null;
    }

    try {
      // Получаем профиль пользователя если доступен
      let userProfile: UserProfile | null = null;
      if (this.profiler) {
        userProfile = await this.profiler.getProfile(author);
        if (!userProfile) {
          // Если профиля нет, быстро анализируем пользователя
          try {
            userProfile = await this.profiler.analyzeUser(author);
            Logger.debug(`📋 Создан новый профиль для ${author}`);
          } catch (error) {
            Logger.warn(`Не удалось создать профиль для ${author}: ${error}`);
          }
        }
      }
      
      const prompt = this.buildPromptWithMemory(messageText, author, context, userProfile);
      const maxTokens = this.calculateMaxTokens();
      
      Logger.debug(`Отправляем запрос к AI модель: ${config.openaiModel}, maxTokens: ${maxTokens}`);
      Logger.debug(`Системный промпт: ${prompt.system.substring(0, 100)}...`);
      
      const requestParams: any = {
        model: config.openaiModel,
        messages: [
          {
            role: 'system',
            content: prompt.system
          },
          {
            role: 'user', 
            content: prompt.user
          }
        ],
        max_completion_tokens: maxTokens
      };

      // Настройки для разных моделей
      if (config.openaiModel === 'gpt-5-nano') {
        // Можно попробовать отключить reasoning для скорости
        // requestParams.reasoning_effort = 'minimal'; // еще быстрее
        requestParams.reasoning_effort = 'low';
        requestParams.verbosity = 'low';
      } else if (config.openaiModel === 'gpt-5-chat-latest') {
        // GPT-5-chat-latest оптимальные настройки для чата
        requestParams.temperature = 0.7;    // Баланс креативности и точности
        requestParams.top_p = 0.95;         // Немного сужаем выбор токенов
        requestParams.store = true;         // Сохраняем для аналитики
      } else if (config.openaiModel.startsWith('gpt-5')) {
        // Другие GPT-5 модели
        requestParams.verbosity = 'medium';
      } else {
        // Старые модели
        requestParams.temperature = 0.9;
        requestParams.presence_penalty = 0.8;
        requestParams.frequency_penalty = 0.5;
      }

      const response = await this.openai!.chat.completions.create(requestParams);
      
      Logger.debug(`Получен ответ от AI: ${JSON.stringify(response, null, 2)}`);

      const aiResponse = response.choices[0]?.message?.content?.trim();
      
      if (aiResponse) {
        // Чистка имени (без изменений)
        let cleanResponse = aiResponse;

        // Удаляем все возможные варианты подписи в начале
        const namePatterns = [
          /^Гейсандр\s*Кулович\s*:\s*/i,
          /^Гейсандр\s*:\s*/i,
          /^Геясандр\s*:\s*/i,
          /^Саня\s*:\s*/i,
          /^Шурик\s*:\s*/i,
          /^Александр\s*:\s*/i,
          /^Алекс\s*:\s*/i,
        ];

        for (const pattern of namePatterns) {
          cleanResponse = cleanResponse.replace(pattern, "");
        }

        cleanResponse = cleanResponse.trim();
        
        if (cleanResponse) {
          Logger.info(`🧠 AI сгенерировал ответ: "${cleanResponse.substring(0, 50)}..."`);
          return cleanResponse;
        }
      }
      
      return null;
    } catch (error) {
      Logger.error("Ошибка при обращении к OpenAI:", error);
      Logger.error("Детали ошибки:", JSON.stringify(error, null, 2));
      return null;
    }
  }

  /**
   * Строит промпт в зависимости от модели
   */
  private buildPromptWithMemory(
    messageText: string,
    author: string,
    context: ChatContext,
    userProfile?: UserProfile | null
  ): { system: string; user: string; } {
    const isNano = config.openaiModel === 'gpt-5-nano';
    
    if (isNano) {
      return this.buildNanoPrompt(messageText, author, context, userProfile);
    } else {
      return this.buildFullPrompt(messageText, author, context, userProfile);
    }
  }

  /**
   * Простой промпт для GPT-5 nano - быстро и экономно
   */
  private buildNanoPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    userProfile?: UserProfile | null
  ): { system: string; user: string; } {
    const memoryContext = context.memoryContext;
    const recentContext = context.recentMessages
      .slice(-3)
      .map((msg) => `${msg.author}: ${msg.text}`)
      .join("\n");

    let memoryPrompt = "";
    if (memoryContext) {
      const userRelation = memoryContext.userRelationships.get(author);
      if (userRelation && userRelation.interactionCount > 1) {
        memoryPrompt += `\n${author}: знакомы ${userRelation.interactionCount} дней`;
      }

      // Только самые релевантные воспоминания
      if (memoryContext.relevantHistory && memoryContext.relevantHistory.length > 0) {
        const bestMemory = memoryContext.relevantHistory[0];
        memoryPrompt += `\nВспоминаю: "${bestMemory.content}"`;
      }

      // Топ-3 темы
      if (memoryContext.activeTopics.length > 0) {
        const topics = memoryContext.activeTopics.slice(0, 3).map(t => t.topic).join(", ");
        memoryPrompt += `\nОбсуждали: ${topics}`;
      }
    }

    // Адаптация под профиль пользователя
    let stylePrompt = "";
    if (userProfile) {
      const style = userProfile.communicationStyle;
      const social = userProfile.socialBehavior;
      
      // Адаптируем формальность
      if (style.formalityLevel < 0.3) {
        stylePrompt += "\nОбщайся неформально, без лишних вежливостей.";
      } else if (style.formalityLevel > 0.7) {
        stylePrompt += "\nБудь чуть более вежливым и формальным.";
      }
      
      // Адаптируем эмоциональность
      if (style.emotionalExpression > 0.6) {
        stylePrompt += "\nМожешь быть эмоциональнее, он это ценит.";
      }
      
      // Адаптируем под интересы
      if (userProfile.interests.topTopics.length > 0) {
        const mainInterest = userProfile.interests.topTopics[0].topic;
        stylePrompt += `\nЕго интересует: ${mainInterest}.`;
      }
      
      // Реагируем на социальное поведение
      if (social.humor > 0.4) {
        stylePrompt += "\nМожешь шутить - он оценит.";
      }
      
      if (social.helpfulness > 0.3) {
        stylePrompt += "\nОн любит помогать, можешь это отметить.";
      }
    }

    const system = `Ты Саня из этого чата.${memoryPrompt}${stylePrompt}

Ответь коротко как друг:

${recentContext}`;

    return { 
      system, 
      user: `${author}: ${messageText}` 
    };
  }

  /**
   * Полный промпт для мощных моделей - с характером и богатой памятью
   */
  private buildFullPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    userProfile?: UserProfile | null
  ): { system: string; user: string; } {
    const memoryContext = context.memoryContext;
    const recentContext = context.recentMessages
      .slice(-5)
      .map((msg) => `${msg.author}: ${msg.text}`)
      .join("\n");

    let characterPrompt = `Ты Саня (Гейсандр Кулович) - постоянный участник этого чата уже несколько лет. 
Ты обычный парень, которому комфортно общаться с друзьями.

ТВОЙ СТИЛЬ ОБЩЕНИЯ:
- Говоришь естественно, без попыток казаться крутым
- Иногда используешь разговорный сленг, когда это уместно
- Можешь материться, но в меру и к месту
- Отвечаешь по существу, не растекаешься мыслью
- Хорошо помнишь людей и прошлые разговоры  
- Реагируешь адекватно ситуации
- С друзьями можешь пошутить или подколоть, но дружелюбно`;

    let memoryPrompt = "";
    if (memoryContext) {
      const userRelation = memoryContext.userRelationships.get(author);
      if (userRelation) {
        memoryPrompt += `\n\nТВОЯ СВЯЗЬ С ${author.toUpperCase()}:`;
        memoryPrompt += `\n- Знакомы ${userRelation.interactionCount} дней`;
        memoryPrompt += `\n- Отношения: ${userRelation.relationship || 'хороший друг по чату'}`;
      }

      // Подробные воспоминания
      if (memoryContext.relevantHistory && memoryContext.relevantHistory.length > 0) {
        memoryPrompt += `\n\nЧТО ПОМНИШЬ ПРО ${author.toUpperCase()}:`;
        memoryContext.relevantHistory.slice(0, 5).forEach((memory, i) => {
          memoryPrompt += `\n${i + 1}. ${memory.author}: "${memory.content}"`;
        });
      }

      // Все активные темы для контекста
      if (memoryContext.activeTopics.length > 0) {
        const topics = memoryContext.activeTopics.slice(0, 10).map(t => t.topic).join(", ");
        memoryPrompt += `\n\nТЕМЫ КОТОРЫЕ ОБСУЖДАЛИ: ${topics}`;
      }

      if (memoryContext.currentMood && memoryContext.currentMood !== "neutral") {
        memoryPrompt += `\nНАСТРОЕНИЕ В ЧАТЕ: ${memoryContext.currentMood}`;
      }

      // Добавляем контекст разговора
      if (memoryContext.conversationSummaries && memoryContext.conversationSummaries.length > 0) {
        memoryPrompt += `\n\nПРЕДЫДУЩИЕ РАЗГОВОРЫ:`;
        memoryContext.conversationSummaries.slice(0, 2).forEach(summary => {
          memoryPrompt += `\n- ${summary.summary}`;
        });
      }
    }

    // Адаптация под профиль пользователя (расширенная версия)
    let stylePrompt = "";
    if (userProfile) {
      stylePrompt += `\n\nАДАПТАЦИЯ ПОД ${author.toUpperCase()}:`;
      
      const style = userProfile.communicationStyle;
      const social = userProfile.socialBehavior;
      
      // Подробная адаптация стиля
      if (style.formalityLevel < 0.2) {
        stylePrompt += `\n- Совсем неформально, как с корешем`;
      } else if (style.formalityLevel < 0.4) {
        stylePrompt += `\n- Неформально, дружески`;
      } else if (style.formalityLevel > 0.7) {
        stylePrompt += `\n- Чуть более вежливо и корректно`;
      }
      
      if (style.emotionalExpression > 0.6) {
        stylePrompt += `\n- Можешь быть эмоциональнее - он экспрессивный`;
      } else if (style.emotionalExpression < 0.3) {
        stylePrompt += `\n- Сдержанно, он не очень эмоциональный`;
      }
      
      if (style.initiationRate > 0.4) {
        stylePrompt += `\n- Он любит начинать разговоры - можешь развить тему`;
      }
      
      // Социальное поведение
      if (social.humor > 0.5) {
        stylePrompt += `\n- Можешь шутить и стебаться - он оценит юмор`;
      } else if (social.humor < 0.2) {
        stylePrompt += `\n- Серьезнее, не особо шутлив`;
      }
      
      if (social.helpfulness > 0.4) {
        stylePrompt += `\n- Он готов помочь - можешь это отметить или попросить совет`;
      }
      
      if (social.supportiveness > 0.4) {
        stylePrompt += `\n- Он поддерживает других - можешь быть открытее`;
      }
      
      // Интересы и темы
      if (userProfile.interests.topTopics.length > 0) {
        const topInterests = userProfile.interests.topTopics.slice(0, 3);
        stylePrompt += `\n- Его интересует: ${topInterests.map(t => t.topic).join(', ')}`;
      }
      
      // Активность
      const peak = userProfile.activityPattern.peakActivity;
      if (peak >= 6 && peak <= 10) {
        stylePrompt += `\n- Он жаворонок (пик в ${peak}:00) - может быть бодрый утром`;
      } else if (peak >= 20 && peak <= 2) {
        stylePrompt += `\n- Он сова (пик в ${peak}:00) - может быть активнее вечером`;
      }
    }

    const system = `${characterPrompt}${memoryPrompt}${stylePrompt}

ПОСЛЕДНИЕ СООБЩЕНИЯ:
${recentContext}

Отвечай естественно, как Саня из чата. Используй память, контекст и адаптируйся под собеседника.`;

    return { 
      system, 
      user: `${author}: ${messageText}` 
    };
  }

  /**
   * Проверяет доступность AI
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  getModelInfo(): string {
    return this.isEnabled ? `${config.openaiModel} с памятью` : "отключен";
  }
}