import OpenAI from "openai";
import { config } from "../core/config.js";
import { Logger } from "../utils/logger.js";
import { BotPersonality, ChatContext } from "../core/types.js";
import { cacheManager, SmartCache } from "../core/cache-manager.js";
// ЭТАП 8: Эмоциональная адаптация
import { EmotionalAdapter, EmotionalAdaptation } from "./emotional-adapter.js";

export class AIEngine {
  private openai: OpenAI | null = null;
  private personality: BotPersonality;
  private isEnabled: boolean;
  // ЭТАП 8: Эмоциональный адаптер
  private emotionalAdapter: EmotionalAdapter;
  // Кэширование AI ответов
  private responseCache: SmartCache<string>;

  constructor(personality: BotPersonality, chatId?: string) {
    this.personality = personality;
    this.isEnabled = config.aiMode !== "patterns_only" && !!config.openaiApiKey;
    
    // ЭТАП 8: Инициализируем эмоциональный адаптер
    this.emotionalAdapter = new EmotionalAdapter();
    
    // Инициализируем кэш для AI ответов
    this.responseCache = cacheManager.getCache<string>('ai');

    if (this.isEnabled) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
      Logger.ai(`Движок активирован (модель: ${config.openaiModel}) с кэшированием`);
    } else {
      Logger.info("🔧 AI движок отключен - используются только паттерны");
    }
  }

  /**
   * Упрощенный расчет токенов для продакшена
   */
  private calculateMaxTokens(): number {
    const baseLength = this.personality.responseStyle.averageLength;
    
    if (config.openaiModel === 'gpt-5-nano') {
      return Math.max(400, Math.min(1500, Math.round(baseLength * 8)));
    } else if (config.openaiModel === 'gpt-5-chat-latest') {
      return Math.max(600, Math.min(2000, Math.round(baseLength * 6)));
    } else {
      return Math.max(200, Math.min(800, Math.round(baseLength * 4)));
    }
  }

  /**
   * Генерация ответа с оптимизацией для продакшена и кэшированием
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

    const startTime = Date.now();
    
    // Создаем ключ кэша на основе контекста
    const cacheKey = this.buildCacheKey(messageText, author, context);
    
    // Проверяем кэш (только для повторяющихся сообщений)
    if (this.shouldUseCache(messageText)) {
      const cachedResponse = this.responseCache.get(cacheKey);
      if (cachedResponse) {
        const duration = Date.now() - startTime;
        Logger.performance('AI генерация (кэш)', duration);
        Logger.ai(`Ответ из кэша`, `"${cachedResponse.substring(0, 50)}..."`);
        return cachedResponse;
      }
    }

    try {
      // ЭТАП 8: Получаем эмоциональную адаптацию
      let emotionalAdaptation: EmotionalAdaptation | null = null;
      if (context.memoryContext) {
        try {
          emotionalAdaptation = this.emotionalAdapter.adaptToEmotionalState(
            author,
            messageText,
            context.memoryContext
          );
        } catch (error) {
          Logger.warn('Ошибка при получении эмоциональной адаптации:', error);
        }
      }
      
      const prompt = this.buildPrompt(messageText, author, context, emotionalAdaptation);
      const maxTokens = this.calculateMaxTokens();
      
      Logger.ai(`Запрос к модели: ${config.openaiModel}`, `maxTokens: ${maxTokens}`);
      
      const requestParams = this.buildRequestParams(prompt, maxTokens);
      const response = await this.openai!.chat.completions.create(requestParams);
      
      const aiResponse = response.choices[0]?.message?.content?.trim();
      
      if (aiResponse) {
        const cleanResponse = this.cleanResponse(aiResponse);
        
        if (cleanResponse) {
          // Сохраняем в кэш (только для подходящих сообщений)
          if (this.shouldUseCache(messageText)) {
            this.responseCache.set(cacheKey, cleanResponse, 5 * 60 * 1000); // 5 минут TTL
          }
          
          const duration = Date.now() - startTime;
          Logger.performance('AI генерация', duration);
          Logger.ai(`Ответ сгенерирован`, `"${cleanResponse.substring(0, 50)}..."`);
          return cleanResponse;
        }
      }
      
      return null;
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error("Ошибка при обращении к OpenAI:", error);
      Logger.performance('AI генерация (ошибка)', duration);
      return null;
    }
  }

  /**
   * Упрощенная сборка параметров запроса
   */
  private buildRequestParams(prompt: { system: string; user: string }, maxTokens: number): any {
    const requestParams: any = {
      model: config.openaiModel,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      max_completion_tokens: maxTokens
    };

    // Настройки для разных моделей
    if (config.openaiModel === 'gpt-5-nano') {
      requestParams.reasoning_effort = 'low';
      requestParams.verbosity = 'low';
    } else if (config.openaiModel === 'gpt-5-chat-latest') {
      requestParams.temperature = 0.7;
      requestParams.top_p = 0.95;
      requestParams.store = true;
    } else {
      // Fallback для других моделей
      requestParams.temperature = 0.8;
    }

    return requestParams;
  }

  /**
   * Очистка ответа от лишних подписей
   */
  private cleanResponse(aiResponse: string): string {
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

    return cleanResponse.trim();
  }

  /**
   * Строит промпт в зависимости от модели
   */
  private buildPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null
  ): { system: string; user: string; } {
    const isNano = config.openaiModel === 'gpt-5-nano';
    
    if (isNano) {
      return this.buildNanoPrompt(messageText, author, context, emotionalAdaptation);
    } else {
      return this.buildCompactPrompt(messageText, author, context, emotionalAdaptation);
    }
  }

  /**
   * Простой промпт для GPT-5 nano - быстро и экономно
   */
  private buildNanoPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null
  ): { system: string; user: string; } {
    const memoryContext = context.memoryContext;
    const recentContext = context.recentMessages
      .slice(-2)
      .map((msg) => `${msg.author}: ${(msg.text || '').replace(/[`$\\]/g, '_')}`)
      .join("\n");

    let memoryPrompt = "";
    if (memoryContext) {
      const userRelation = memoryContext.userRelationships.get(author);
      if (userRelation && userRelation.interactionCount > 1) {
        memoryPrompt += `\n${author}: знакомы ${userRelation.interactionCount} дней`;
      }

      // Только 1 воспоминание
      if (memoryContext.relevantHistory && memoryContext.relevantHistory.length > 0) {
        const bestMemory = memoryContext.relevantHistory[0];
        memoryPrompt += `\nВспоминаю: "${bestMemory.content.substring(0, 50)}"`;
      }

      // Топ-2 темы
      if (memoryContext.activeTopics.length > 0) {
        const topics = memoryContext.activeTopics.slice(0, 2).map(t => t.topic).join(", ");
        memoryPrompt += `\nТемы: ${topics}`;
      }

      // 1 событие
      if (memoryContext.relevantEvents && memoryContext.relevantEvents.length > 0) {
        const event = memoryContext.relevantEvents[0];
        memoryPrompt += `\nСобытие: ${event.title}`;
      }
    }

    // Эмоциональная адаптация
    let emotionalPrompt = "";
    if (emotionalAdaptation) {
      const { emotionalContext, behaviorInstructions } = emotionalAdaptation.promptAdjustments;
      if (emotionalContext) {
        emotionalPrompt += `\n${emotionalContext}`;
      }
      if (behaviorInstructions) {
        emotionalPrompt += `\n${behaviorInstructions}`;
      }
    }

    // Контекстная адаптация поведения
    let contextualPrompt = "";
    if (context.responseStyle && context.responseStyle !== 'casual') {
      switch (context.responseStyle) {
        case 'supportive':
          contextualPrompt += `\nБудь поддерживающим.`;
          break;
        case 'humorous': 
          contextualPrompt += `\nМожешь шутить.`;
          break;
        case 'technical':
          contextualPrompt += `\nОтвечай технично.`;
          break;
        case 'careful':
          contextualPrompt += `\nБудь осторожным.`;
          break;
      }
    }

    // Безопасная конкатенация строк без template literals
    const systemParts = [
      'Ты Саня из чата.',
      memoryPrompt || '',
      emotionalPrompt || '',
      contextualPrompt || '',
      '\n\nПоследние сообщения:',
      '\n' + (recentContext || ''),
      '\n\nОтветь коротко как друг.'
    ];
    
    const system = systemParts.join('');

    return { 
      system, 
      user: author + ': ' + messageText // Безопасная конкатенация без template literals
    };
  }

  /**
   * Компактный промпт для других моделей - оптимизированный
   */
  private buildCompactPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null
  ): { system: string; user: string; } {
    const memoryContext = context.memoryContext;
    const recentContext = context.recentMessages
      .slice(-3)
      .map((msg) => `${msg.author}: ${(msg.text || '').replace(/[`$\\]/g, '_')}`)
      .join("\n");

    let characterPrompt = `Ты Саня (Гейсандр Кулович) - участник этого чата.

Твой стиль:
- Говоришь естественно, без попыток казаться крутым
- Можешь использовать сленг когда уместно
- Отвечаешь по существу
- Помнишь людей и разговоры`;

    let memoryPrompt = "";
    if (memoryContext) {
      const userRelation = memoryContext.userRelationships.get(author);
      if (userRelation) {
        memoryPrompt += `\n\nС ${author}: знакомы ${userRelation.interactionCount} дней, отношения: ${userRelation.relationship || 'друг'}`;
      }

      // Только важные воспоминания
      if (memoryContext.relevantHistory && memoryContext.relevantHistory.length > 0) {
        memoryPrompt += `\n\nПомнишь про ${author}:`;
        memoryContext.relevantHistory.slice(0, 2).forEach((memory, i) => {
          memoryPrompt += `\n${i + 1}. "${memory.content.substring(0, 60)}"`;
        });
      }

      // Топ-5 тем
      if (memoryContext.activeTopics.length > 0) {
        const topics = memoryContext.activeTopics.slice(0, 5).map(t => t.topic).join(", ");
        memoryPrompt += `\n\nТемы чата: ${topics}`;
      }

      // События чата
      if (memoryContext.relevantEvents && memoryContext.relevantEvents.length > 0) {
        memoryPrompt += `\n\nСобытия:`;
        memoryContext.relevantEvents.slice(0, 2).forEach((event, i) => {
          const timeAgo = Math.floor((Date.now() - event.timestamp.getTime()) / (1000 * 60 * 60 * 24));
          memoryPrompt += `\n${i + 1}. ${event.title} (${timeAgo}д назад)`;
        });
      }
    }

    // Эмоциональная адаптация
    let emotionalPrompt = "";
    if (emotionalAdaptation) {
      const { emotionalContext, behaviorInstructions } = emotionalAdaptation.promptAdjustments;
      if (emotionalContext) {
        emotionalPrompt += `\n\nЭмоции: ${emotionalContext}`;
      }
      if (behaviorInstructions) {
        emotionalPrompt += `\nПоведение: ${behaviorInstructions}`;
      }
    }

    // Контекстная адаптация (расширенная версия)
    let contextualPrompt = "";
    if (context.responseStyle && context.responseStyle !== 'casual') {
      contextualPrompt += `\n\nСитуация:`;
      switch (context.responseStyle) {
        case 'supportive':
          contextualPrompt += `\n- Будь поддерживающим и понимающим`;
          break;
        case 'humorous':
          contextualPrompt += `\n- Можешь шутить и веселиться`;
          break;
        case 'technical':
          contextualPrompt += `\n- Говори по существу, технично`;
          break;
        case 'careful':
          contextualPrompt += `\n- Будь осторожным и тактичным`;
          break;
      }
    }

    // Безопасная конкатенация строк без template literals
    const systemParts = [
      characterPrompt || '',
      memoryPrompt || '',
      emotionalPrompt || '',
      contextualPrompt || '',
      '\n\nПоследние сообщения:',
      '\n' + (recentContext || ''),
      '\n\nОтвечай естественно как Саня из чата.'
    ];
    
    const system = systemParts.join('');

    return { 
      system, 
      user: author + ': ' + messageText // Безопасная конкатенация без template literals
    };
  }

  /**
   * Проверяет доступность AI
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  getModelInfo(): string {
    return this.isEnabled ? `${config.openaiModel} с памятью и кэшированием` : "отключен";
  }

  // Методы для работы с кэшированием

  /**
   * Создает ключ кэша на основе контекста
   */
  private buildCacheKey(messageText: string, author: string, context: ChatContext): string {
    // Используем только основные параметры для ключа
    const normalizedText = messageText.toLowerCase().trim();
    const recentMessagesHash = this.hashRecentMessages(context.recentMessages || []);
    
    return `${author}:${normalizedText}:${recentMessagesHash}:${config.openaiModel}`;
  }

  /**
   * Создает хэш недавних сообщений для контекста
   */
  private hashRecentMessages(messages: any[]): string {
    // Берем только последние 3 сообщения для контекста
    const recentContext = messages.slice(-3).map(msg => 
      (msg.author || 'Unknown') + ':' + (msg.text || '').substring(0, 20)
    ).join('|');
    
    // Безопасное хэширование без btoa (работает с Unicode)
    let hash = 0;
    for (let i = 0; i < recentContext.length; i++) {
      const char = recentContext.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32-битный integer
    }
    return Math.abs(hash).toString(16).substring(0, 16);
  }

  /**
   * Определяет стоит ли использовать кэш для данного сообщения
   */
  private shouldUseCache(messageText: string): boolean {
    // Кэшируем только короткие однотипные сообщения
    const text = messageText.toLowerCase().trim();
    
    // Простые приветствия и однословные ответы
    const cacheablePatterns = [
      /^привет/,
      /^здарова/,
      /^как дела/,
      /^что нового/,
      /^да$/,
      /^нет$/,
      /^ок$/,
      /^спасибо$/,
      /^пока$/
    ];
    
    // Кэшируем только короткие сообщения (меньше 50 символов)
    if (text.length > 50) return false;
    
    return cacheablePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Получает статистику кэша AI
   */
  getCacheStats(): any {
    return this.responseCache.getStats();
  }

  /**
   * Очищает кэш AI ответов
   */
  clearCache(): void {
    this.responseCache.clear();
    Logger.info('🧹 Кэш AI ответов очищен');
  }

  /**
   * Принудительная очистка просроченных записей
   */
  cleanupCache(): void {
    this.responseCache.cleanup();
    Logger.debug('🧹 Очистка просроченных AI ответов завершена');
  }
}
