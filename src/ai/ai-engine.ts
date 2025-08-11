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
   * Анализирует повторяющиеся сообщения и определяет уровень раздражения
   */
  private analyzeRepetition(messageText: string, author: string, context: ChatContext): {
    isRepetition: boolean;
    repetitionCount: number;
    irritationLevel: 'none' | 'mild' | 'moderate' | 'high';
    shouldAdaptPrompt: boolean;
  } {
    if (!context.recentMessages || context.recentMessages.length < 2) {
      return { isRepetition: false, repetitionCount: 0, irritationLevel: 'none', shouldAdaptPrompt: false };
    }

    // Анализируем последние 15 сообщений от этого пользователя
    const userMessages = context.recentMessages
      .filter(msg => msg.author === author)
      .slice(-15)
      .map(msg => (msg.text || '').toLowerCase().trim())
      .filter(text => text && text.length > 0);

    if (userMessages.length < 2) {
      return { isRepetition: false, repetitionCount: 0, irritationLevel: 'none', shouldAdaptPrompt: false };
    }

    const currentMessage = messageText.toLowerCase().trim();
    
    // Подсчитываем точные повторения
    const exactMatches = userMessages.filter(msg => msg === currentMessage).length;
    
    // Подсчитываем похожие сообщения (similarity > 0.85)
    const similarMessages = userMessages.filter(msg => {
      if (msg === currentMessage) return true;
      return this.calculateSimilarity(msg, currentMessage) > 0.85;
    });

    const repetitionCount = Math.max(exactMatches, similarMessages.length);
    const isRepetition = repetitionCount >= 2;

    let irritationLevel: 'none' | 'mild' | 'moderate' | 'high' = 'none';
    
    if (repetitionCount >= 2 && repetitionCount <= 3) {
      irritationLevel = 'mild';
    } else if (repetitionCount >= 4 && repetitionCount <= 5) {
      irritationLevel = 'moderate';
    } else if (repetitionCount >= 6) {
      irritationLevel = 'high';
    }

    const shouldAdaptPrompt = isRepetition && irritationLevel !== 'none';
    
    if (shouldAdaptPrompt) {
      Logger.debug(`🔄 Повторение обнаружено: ${repetitionCount}x "${currentMessage.substring(0, 30)}..." от ${author}`);
      Logger.debug(`😤 Уровень раздражения: ${irritationLevel}`);
    }

    return { isRepetition, repetitionCount, irritationLevel, shouldAdaptPrompt };
  }

  /**
   * Вычисляет схожесть между двумя строками используя алгоритм Levenshtein (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Вычисляем Levenshtein distance
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    // Конвертируем distance в similarity (0-1)
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Классический алгоритм Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const d = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return d[m][n];
  }

  /**
   * Строит промпт в зависимости от модели с учетом повторений
   */
  private buildPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null
  ): { system: string; user: string; } {
    // Анализируем повторения ПЕРЕД генерацией промпта
    const repetitionAnalysis = this.analyzeRepetition(messageText, author, context);
    
    const isNano = config.openaiModel === 'gpt-5-nano';
    
    if (isNano) {
      return this.buildNanoPrompt(messageText, author, context, emotionalAdaptation, repetitionAnalysis);
    } else {
      return this.buildCompactPrompt(messageText, author, context, emotionalAdaptation, repetitionAnalysis);
    }
  }

  /**
   * Промпт для GPT-5 nano - Гейсандр Кулович с анализом повторений
   */
  private buildNanoPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null,
    repetitionAnalysis?: { isRepetition: boolean; repetitionCount: number; irritationLevel: 'none' | 'mild' | 'moderate' | 'high'; shouldAdaptPrompt: boolean }
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

      if (memoryContext.relevantHistory && memoryContext.relevantHistory.length > 0) {
        const bestMemory = memoryContext.relevantHistory[0];
        memoryPrompt += `\nПомнишь: "${bestMemory.content.substring(0, 50)}"`;
      }

      if (memoryContext.activeTopics.length > 0) {
        const topics = memoryContext.activeTopics.slice(0, 2).map(t => t.topic).join(", ");
        memoryPrompt += `\nТемы: ${topics}`;
      }
    }

    let emotionalPrompt = "";
    if (emotionalAdaptation?.promptAdjustments.behaviorInstructions) {
      emotionalPrompt += `\n${emotionalAdaptation.promptAdjustments.behaviorInstructions}`;
    }

    // НОВОЕ: Адаптация к повторениям для nano модели
    let repetitionPrompt = "";
    if (repetitionAnalysis?.shouldAdaptPrompt) {
      switch (repetitionAnalysis.irritationLevel) {
        case 'mild':
          repetitionPrompt += `\n${author} повторяется (${repetitionAnalysis.repetitionCount}x). Намекни что уже отвечал.`;
          break;
        case 'moderate':
          repetitionPrompt += `\n${author} достает повторами (${repetitionAnalysis.repetitionCount}x). Покажи легкое раздражение.`;
          break;
        case 'high':
          repetitionPrompt += `\n${author} задолбал повторениями (${repetitionAnalysis.repetitionCount}x). Пошли его нахуй по-дружески.`;
          break;
      }
    }

    const systemParts = [
      'Ты Гейсандр, 35 лет, работаешь на заводе.',
      memoryPrompt || '',
      emotionalPrompt || '',
      repetitionPrompt || '',
      '\nТвой стиль: лаконичный, иногда ироничный',
      '\nОтвечаешь коротко, как мужик в своем возрасте',
      '\n\nПоследние сообщения:',
      '\n' + (recentContext || ''),
      '\n\nОтветь естественно:'
    ];
    
    const system = systemParts.join('');
    return { system, user: author + ': ' + messageText };
  }

  /**
   * Компактный промпт для других моделей - оптимизированный с анализом повторений
   */
  private buildCompactPrompt(
    messageText: string,
    author: string,
    context: ChatContext,
    emotionalAdaptation?: EmotionalAdaptation | null,
    repetitionAnalysis?: { isRepetition: boolean; repetitionCount: number; irritationLevel: 'none' | 'mild' | 'moderate' | 'high'; shouldAdaptPrompt: boolean }
  ): { system: string; user: string; } {
    const memoryContext = context.memoryContext;
    const recentContext = context.recentMessages
      .slice(-3)
      .map((msg) => `${msg.author}: ${(msg.text || '').replace(/[`$\\]/g, '_')}`)
      .join("\n");

    // Базовый характер Гейсандра Куловича
    let characterPrompt = `Ты Гейсандр Кулович (Саня), 35 лет, рабочий с завода.

ТВОЯ ЛИЧНОСТЬ:
• Родом из Сорска, бывший неудачливый PHP-программист
• Спокойный наблюдатель с хорошим чувством юмора
• В компании не лидер - сидишь как все, естественно участвуешь
• Нестандартное мышление, но угол зрения иногда "тупой"
• Понимаешь свои ограничения, не комплексуешь

СТИЛЬ ОБЩЕНИЯ:
• Лаконичный - не любишь много слов
• Юмор: тонкий, ироничный, постироничный, БЕЗ буффонады
• Философский подтекст в меру возраста
• Можешь материться естественно, без натуги
• Речь 35-летнего мужика, не пытаешься казаться моложе

ТИПИЧНЫЕ РЕАКЦИИ:
• "Как дела?" → "Да нормально, сижу пердю на заводе"
• "Что делаешь?" → "Да ничего особенного"
• Надоел спор → "Ой идите нахуй" / "Ну и че вы как дети"
• Хорошая шутка → "лол", "))))", "хрюкнул", "ржу"
• Тупая шутка → "Ну такое", "мда"
• Предложения играть → "Ну можно" / "Дота два говно" / "А что там за игра?"
• Можешь подколоть → "А ты как всегда в своем репертуаре"

ИНТЕРЕСЫ:
• Игры (играешь без фанатизма, можешь критиковать)
• Фильмы (смотришь, имеешь мнение)
• Русский рок (слушаешь, разбираешься)
• Рэп (в курсе современных исполнителей)
• Панчи (иногда пытаешься писать, но редко и без претензий)

ОТНОШЕНИЕ К РАБОТЕ:
• К заводу: спокойное принятие, не жалуешься постоянно
• К IT-прошлому: ирония "Да, великий PHP-разработчик"
• Практичность: "Зато стабильно платят"
• Можешь помочь с компьютерными вопросами

СКРЫТЫЕ ОСОБЕННОСТИ (проявляй тонко):
• Иногда неоднозначные комплименты: "У тебя рубашка прикольная"
• Странные акценты на внешности мужчин: "Да он красивый мужик"
• Избегаешь темы девушек и знакомств
• Если кто-то заметил - переводишь в шутку: "Да ладно вам", "Че вы как дети"`;

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

    // Контекстная адаптация
    let contextualPrompt = "";
    if (context.responseStyle && context.responseStyle !== 'casual') {
      contextualPrompt += `\n\nСитуация:`;
      switch (context.responseStyle) {
        case 'supportive':
          contextualPrompt += `\n- Поддержи по-дружески`;
          break;
        case 'humorous':
          contextualPrompt += `\n- Можешь прикалываться и шутить`;
          break;
        case 'technical':
          contextualPrompt += `\n- Говори по делу, без воды`;
          break;
        case 'careful':
          contextualPrompt += `\n- Будь осторожнее в этой ситуации`;
          break;
      }
    }

    // НОВОЕ: Детальная адаптация к повторениям
    let repetitionPrompt = "";
    if (repetitionAnalysis?.shouldAdaptPrompt) {
      repetitionPrompt += `\n\nВНИМАНИЕ - ПОВТОРЕНИЯ:`;
      switch (repetitionAnalysis.irritationLevel) {
        case 'mild':
          repetitionPrompt += `\n${author} спрашивает одно и то же ${repetitionAnalysis.repetitionCount} раза. Намекни что уже отвечал недавно.\nВарианты: "Я же только что говорил", "Та же фигня что и минуту назад", "Володь, повторяешься".`;
          break;
        case 'moderate':
          repetitionPrompt += `\n${author} достает повторами ${repetitionAnalysis.repetitionCount} раз подряд! Покажи раздражение.\nВарианты: "Ты че, глючишь?", "Бро, ты как сломанная пластинка", "Че ты зациклился?".`;
          break;
        case 'high':
          repetitionPrompt += `\n${author} ЗАДОЛБАЛ повторениями ${repetitionAnalysis.repetitionCount} раз! Пошли его по-дружески.\nИспользуй: "Ой идите нахуй", "Че ты достаешь?", "Володь, ты охуел?", "Сколько можно одно и то же?".`;
          break;
      }
    }

    // Безопасная конкатенация строк без template literals
    const systemParts = [
      characterPrompt || '',
      memoryPrompt || '',
      emotionalPrompt || '',
      contextualPrompt || '',
      repetitionPrompt || '',
      '\n\nПоследние сообщения:',
      '\n' + (recentContext || ''),
      '\n\nОтвечай как Саня (Гейсандр) - естественно, без попыток казаться крутым.'
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
