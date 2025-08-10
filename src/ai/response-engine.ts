import { 
  BotPersonality, 
  TriggerPattern, 
  ChatContext,
  ImageAnalysisResult,
  MemoryContext
} from '../core/types.js';
import { Logger } from '../utils/logger.js';
import { AIEngine } from './ai-engine.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { config } from '../core/config.js';
// ЭТАП 8: Эмоциональная адаптация
import { EmotionalAdapter, EmotionalAdaptation } from './emotional-adapter.js';
// ЭТАП 9: Динамическая активность
import { ActivityManager } from '../core/activity-manager.js';
// Константы производительности
import { MEMORY_LIMITS, TIMEOUTS, IMPORTANCE_THRESHOLDS, CONTENT_LIMITS } from '../constants/performance.js';

export class ResponseEngine {
  private personality: BotPersonality;
  private context: ChatContext;
  private aiEngine: AIEngine;
  private memoryManager: MemoryManager | null = null;
  private chatId: string | null = null;
  // ЭТАП 8: Эмоциональный адаптер
  private emotionalAdapter: EmotionalAdapter;
  // ЭТАП 9: Менеджер активности
  private activityManager: ActivityManager | null = null;

  constructor(personality: BotPersonality, chatId?: string) {
    this.personality = personality;
    this.chatId = chatId || null;
    this.aiEngine = new AIEngine(personality, this.chatId || undefined);
    
    // ЭТАП 8: Инициализируем эмоциональный адаптер
    this.emotionalAdapter = new EmotionalAdapter();
    
    // ЭТАП 9: Инициализируем менеджер активности
    if (chatId) {
      this.activityManager = new ActivityManager(chatId);
    }
    
    // Инициализируем память только если есть chatId
    if (chatId) {
      this.initializeMemory(chatId);
    }
    
    this.context = {
      recentMessages: [],
      activeUsers: new Set(),
      messagesSinceLastResponse: 0
    };
  }

  /**
   * Инициализирует память для конкретного чата
   */
  initializeMemory(chatId: string): void {
    if (this.memoryManager) {
      this.memoryManager.close();
    }
    
    this.chatId = chatId;
    this.memoryManager = new MemoryManager(chatId);
    Logger.info('🧠 Система памяти активирована для чата');
  }

  /**
   * ЭТАП 9: Анализирует контекстную ситуацию для оптимизации поведения
   */
  private analyzeContextualSituation(messageText: string, author: string): {
    situationType: 'normal' | 'conflict' | 'celebration' | 'group_discussion' | 'private_moment' | 'technical_discussion';
    behaviorModifier: number;
    responseStyle: 'casual' | 'supportive' | 'humorous' | 'technical' | 'careful';
  } {
    const lowerText = messageText.toLowerCase();
    const recentMessages = this.context.recentMessages;
    
    // Определяем тип ситуации
    let situationType: 'normal' | 'conflict' | 'celebration' | 'group_discussion' | 'private_moment' | 'technical_discussion' = 'normal';
    let behaviorModifier = 1.0;
    let responseStyle: 'casual' | 'supportive' | 'humorous' | 'technical' | 'careful' = 'casual';
    
    // Проверка на конфликт
    const conflictWords = ['спор', 'конфликт', 'не согласен', 'ерунда', 'глупость', 'идиот', 'дурак'];
    if (conflictWords.some(word => lowerText.includes(word))) {
      situationType = 'conflict';
      behaviorModifier = 0.3; // Очень аккуратно в конфликтах
      responseStyle = 'careful';
    }
    
    // Проверка на празднование
    const celebrationWords = ['поздравляю', 'день рождения', 'праздник', 'ура', '🎉', '🎂', 'молодец'];
    if (celebrationWords.some(word => lowerText.includes(word))) {
      situationType = 'celebration';
      behaviorModifier = 1.5; // Более активно в празднованиях
      responseStyle = 'supportive';
    }
    
    // Проверка на групповую дискуссию (много участников недавно)
    const uniqueRecentAuthors = new Set(recentMessages.slice(-5).map(msg => msg.author));
    if (uniqueRecentAuthors.size >= 3 && this.context.messagesSinceLastResponse > 2) {
      situationType = 'group_discussion';
      behaviorModifier = 0.7; // Менее активно в групповых дискуссиях
      responseStyle = 'casual';
    }
    
    // Проверка на техническое обсуждение
    const techWords = ['код', 'программ', 'алгоритм', 'бот', 'api', 'база данных', 'сервер', 'github'];
    if (techWords.some(word => lowerText.includes(word))) {
      situationType = 'technical_discussion';
      behaviorModifier = 1.2; // Чуть активнее в технических темах
      responseStyle = 'technical';
    }
    
    // Проверка на личный момент
    const personalWords = ['переживаю', 'проблема', 'грустно', 'устал', 'болею', 'расстроен'];
    if (personalWords.some(word => lowerText.includes(word))) {
      situationType = 'private_moment';
      behaviorModifier = 1.8; // Очень активно в личных моментах
      responseStyle = 'supportive';
    }
    
    return { situationType, behaviorModifier, responseStyle };
  }

  /**
   * Определяет нужно ли отвечать на сообщение
   */
  shouldRespond(messageText: string, author: string): boolean {
    // НЕ отвечаем на свои сообщения и если нас называют "ботом"
    if (author === 'Гейсандр Кулович' || author === 'bot') return false;
    
    // Игнорируем если нас называют ботом
    const lowerText = messageText.toLowerCase();
    if (lowerText.includes('бот') || lowerText.includes('bot')) {
      return false;
    }

    this.context.messagesSinceLastResponse++;

    // ЭТАП 9: Анализируем контекстную ситуацию
    const situationAnalysis = this.analyzeContextualSituation(messageText, author);
    
    // Проверяем прямое обращение к Гейсандру Куловичу
    if (this.isDirectMention(messageText)) {
      return true;
    }

    // ЭТАП 9: Проверяем динамическую активность
    const activityModifiers = this.activityManager?.getActivityModifiers();
    
    if (activityModifiers) {
      // Используем динамическую оценку активности
      if (!activityModifiers.isActiveTime && Math.random() > 0.3) {
        return false;
      }
    } else {
      // Fallback на статическое расписание
      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();
      
      if (!this.personality.schedule.activeHours.includes(currentHour) ||
          !this.personality.schedule.activeDays.includes(currentDay)) {
        return false;
      }
    }

    // В AI режиме более гибкая логика ответов
    if (this.aiEngine.isAvailable()) {
      const randomChance = Math.random();
      let shouldRespondChance = this.personality.responseStyle.activityLevel * 0.4;
      
      // Проверяем не слишком ли часто отвечаем
      if (this.context.lastBotResponse) {
        const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
        const minDelay = (1 - this.personality.responseStyle.activityLevel) * 180000;
        
        if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 2) {
          return false;
        }
      }
      
      // ЭТАП 8: Эмоциональная адаптация вероятности ответа
      if (this.context.memoryContext) {
        try {
          const adaptation = this.emotionalAdapter.adaptToEmotionalState(
            author,
            messageText,
            this.context.memoryContext
          );
          shouldRespondChance *= adaptation.responseModifier;
          Logger.debug(`🎭 Эмоциональная модификация вероятности: ${adaptation.responseModifier.toFixed(2)}x`);
        } catch (error) {
          Logger.warn('Ошибка при эмоциональной адаптации:', error);
        }
      }
      
      // ЭТАП 9: Адаптация под динамическую активность
      if (activityModifiers) {
        shouldRespondChance *= activityModifiers.responseMultiplier;
        
        // Дополнительная логика на основе неактивности чата
        if (activityModifiers.inactivityPeriod > 60) { // Более часа тишины
          shouldRespondChance *= 1.5; // Больше шансов "оживить" чат
        } else if (activityModifiers.inactivityPeriod < 5) { // Активный разговор
          shouldRespondChance *= 0.7; // Меньше шансов мешать
        }
        
        const stats = this.activityManager?.getActivityStats() || '';
        Logger.debug(`📊 Динамическая активность: ${activityModifiers.responseMultiplier.toFixed(2)}x (${stats})`);
      }

      // ЭТАП 9: Адаптация под контекстную ситуацию
      shouldRespondChance *= situationAnalysis.behaviorModifier;
      Logger.debug(`🎯 Контекстная ситуация: ${situationAnalysis.situationType} (модификатор: ${situationAnalysis.behaviorModifier.toFixed(2)}x, стиль: ${situationAnalysis.responseStyle})`);
      
      Logger.debug(`Гейсандр Кулович (AI с памятью): шанс ответа ${shouldRespondChance.toFixed(3)}, случайное: ${randomChance.toFixed(3)}`);
      return randomChance < shouldRespondChance;
    }

    // Классическая логика для паттернов
    const matchingPattern = this.findMatchingPattern(messageText);
    if (!matchingPattern) {
      return false;
    }

    if (this.context.lastBotResponse) {
      const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
      const minDelay = (1 - this.personality.responseStyle.activityLevel) * 300000;
      
      if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 3) {
        return false;
      }
    }

    const randomChance = Math.random();
    const shouldRespondChance = this.personality.responseStyle.activityLevel * 0.3;
    
    return randomChance < shouldRespondChance;
  }

  /**
   * Генерирует ответ используя AI или паттерны с памятью
   */
  async generateResponse(messageText: string, author: string, messageId?: number): Promise<string | null> {
    // ЭТАП 9: Анализируем контекстную ситуацию для стиля ответа
    const situationAnalysis = this.analyzeContextualSituation(messageText, author);
    // Если есть память, строим контекст
    if (this.memoryManager) {
      try {
        const memoryContext = await this.memoryManager.buildMemoryContext(messageText, author);
        this.context.memoryContext = memoryContext;
        Logger.memory(`Контекст памяти построен для ${author}`);
      } catch (error) {
        Logger.error('Ошибка при построении контекста памяти:', error);
      }
    } else {
      Logger.warn('MemoryManager отсутствует - ответ без памяти');
    }
    const useAI = this.shouldUseAI(messageText);
    
    if (useAI && this.aiEngine.isAvailable()) {
      // Добавляем стиль ответа в контекст
      const contextWithStyle = { 
        ...this.context, 
        responseStyle: situationAnalysis.responseStyle,
        situationType: situationAnalysis.situationType
      };
      const aiResponse = await this.aiEngine.generateResponse(messageText, author, contextWithStyle);
      
      if (aiResponse) {
        this.updateContext('Гейсандр Кулович', aiResponse, messageId);
        return aiResponse;
      } else {
        Logger.warn('AI не смог сгенерировать ответ, используем паттерны');
      }
    }

    // Fallback на паттерны
    const patternResponse = this.generatePatternResponse(messageText);
    
    if (patternResponse) {
      this.updateContext('Гейсандр Кулович', patternResponse, messageId);
      return patternResponse;
    }

    return null;
  }

  /**
   * Определяет нужно ли использовать AI для ответа
   */
  private shouldUseAI(messageText: string): boolean {
    switch (config.aiMode) {
      case 'ai_only':
        return true;
      case 'patterns_only':
        return false;
      case 'hybrid':
        if (this.isDirectMention(messageText)) {
          return true;
        }
        
        if (messageText.length > 100 || messageText.includes('?')) {
          return Math.random() < config.aiProbability * 1.2;
        }
        
        return Math.random() < config.aiProbability;
      default:
        return false;
    }
  }

  /**
   * Генерирует ответ на основе паттернов
   */
  private generatePatternResponse(messageText: string): string | null {
    const pattern = this.findMatchingPattern(messageText);
    if (!pattern) return null;

    const responses = pattern.responses;
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    Logger.info(`Выбран паттерн: ${pattern.id}, ответ: ${randomResponse.substring(0, 50)}...`);
    return randomResponse;
  }

  /**
   * Обновляет контекст разговора и сохраняет в память
   */
  updateContext(
    author: string, 
    messageText: string, 
    messageId?: number, 
    messageType: 'text' | 'image' | 'media' = 'text',
    imageAnalysis?: ImageAnalysisResult
  ): void {
    this.context.recentMessages.push({
      text: messageText,
      author,
      timestamp: new Date()
    });

    // Оставляем только последние сообщения
    if (this.context.recentMessages.length > CONTENT_LIMITS.RECENT_MESSAGES * 2) {
      this.context.recentMessages = this.context.recentMessages.slice(-CONTENT_LIMITS.RECENT_MESSAGES * 2);
    }

    this.context.activeUsers.add(author);

    if (author === 'Гейсандр Кулович' || author === 'bot') {
      this.context.lastBotResponse = new Date();
      this.context.messagesSinceLastResponse = 0;
    }

    // Сохраняем в память если доступно
    
    if (this.memoryManager && messageId && this.chatId) {
      try {
        const importance = this.calculateMessageImportance(messageText, author);
        const emotion = this.detectEmotion(messageText);
        
        // ЭТАП 9: Умное извлечение тем - ТОЛЬКО для пользователей, НЕ для бота
        let topics: string[] = [];
        if (author !== 'Гейсандр Кулович') {
          topics = this.extractTopics(messageText, {
            emotion,
            imageAnalysis,
            memoryContext: this.context.memoryContext
          });
        }
        
        // Сохраняем в базу данных активные темы (только значимые)
        const importantTopics = topics.filter(topic => 
          topic && topic.length >= 5 && 
          !['морковка', 'клитор', 'проект'].includes(topic.toLowerCase()) // фильтруем мусор
        );
        
        // Обрабатываем специальные темы
        if (messageText.toLowerCase().includes('морровка') || messageText.toLowerCase().includes('морковка')) {
          importantTopics.push('морковка');
        }
        if (messageText.toLowerCase().includes('gpt') || messageText.toLowerCase().includes('гпт')) {
          importantTopics.push('GPT');
        }
        if (messageText.toLowerCase().includes('проект')) {
          importantTopics.push('проекты');
        }

        // Добавляем темы из анализа изображений
        if (imageAnalysis && imageAnalysis.tags.length > 0) {
          importantTopics.push(...imageAnalysis.tags);
        }
        
        // Обновляем темы в БД только для пользователей (не для бота)
        if (author !== 'Гейсандр Кулович') {
          importantTopics.forEach(topic => {
            this.updateTopicInDatabase(topic, author);
          });
        }
        
        this.memoryManager.saveMessage({
          chatId: this.chatId,
          messageId: messageId,
          author: author,
          content: messageText,
          timestamp: new Date(),
          messageType: messageType as "text" | "media" | "system" | "image",
          isFromBot: author === 'Гейсандр Кулович',
          importance: importance,
          emotion: emotion as "positive" | "negative" | "neutral" | "excited" | "angry" | "sad" | "funny" | "friendly" | "curious" | "engaging",
          topics: topics,
          mentions: this.extractMentions(messageText),
          imageAnalysis: imageAnalysis
        });

        // Обновляем отношения с пользователем (только для пользователей, не для бота)
        if (author !== 'Гейсандр Кулович') {
          this.memoryManager.updateUserRelationship(author, {
            commonTopics: topics,
            mood: (['positive', 'friendly', 'excited'].includes(emotion) ? 'positive' : 
                  ['negative', 'angry', 'sad'].includes(emotion) ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral'
          });
        }

        Logger.memory(`Сообщение сохранено: "${messageText.substring(0, 30)}..." от ${author}`);
      } catch (error) {
        Logger.error('❌ Ошибка сохранения в память:', error);
      }
    } else {
      Logger.warn(`Не сохраняем в память: memoryManager=${!!this.memoryManager}, messageId=${messageId}`);
    }

    // Очищаем неактивных пользователей
    const tenMinutesAgo = Date.now() - 600000;
    this.context.recentMessages = this.context.recentMessages.filter(
      msg => msg.timestamp.getTime() > tenMinutesAgo
    );
  }

  /**
   * Рассчитывает важность сообщения
   */
  private calculateMessageImportance(text: string, author: string): number {
    let importance = 0.5; // Базовая важность

    // Прямые обращения важнее
    if (this.isDirectMention(text)) {
      importance += IMPORTANCE_THRESHOLDS.MEDIUM_IMPORTANCE;
    }

    // Длинные сообщения важнее
    if (text.length > 100) {
      importance += 0.2;
    }

    // Вопросы важнее
    if (text.includes('?')) {
      importance += 0.1;
    }

    // Ограничиваем диапазон 0-1
    return Math.min(1.0, Math.max(IMPORTANCE_THRESHOLDS.LOW_IMPORTANCE, importance));
  }

  /**
   * Определяет эмоцию сообщения
   */
  private detectEmotion(text: string): string {
    const lowerText = text.toLowerCase();
    
    // Позитивные слова и эмоции
    const positiveWords = [
      'круто', 'класс', 'супер', 'отлично', 'здорово', 'ура', 'хорошо', 'норм', 'збс',
      'привет', 'здарова', 'хай', 'йо', 'салют', 'добро', 'спасибо', 'благодарю',
      'молодец', 'красота', 'огонь', 'топ', 'кайф', 'лайк', 'love', 'любовь',
      '😄', '😊', '👍', '🔥', '❤️', '💕', '✨', '🎉', '😎', '🤩', '😍'
    ];
    
    // Негативные слова и эмоции  
    const negativeWords = [
      'плохо', 'ужас', 'кошмар', 'бесит', 'злой', 'грустно', 'фу', 'блять', 'сука',
      'дерьмо', 'говно', 'пиздец', 'херня', 'отстой', 'гавно', 'жесть', 'капец',
      'ненавижу', 'раздражает', 'задолбал', 'достал', 'печаль',
      '😢', '😠', '😡', '💩', '😤', '🤬', '😞', '😔', '💔', '😭'
    ];
    
    // Возбужденные/удивленные эмоции
    const excitedWords = [
      'вау', 'ого', 'офигеть', 'невероятно', 'охуеть', 'пиздато', 'ахуенно',
      'нихуя себе', 'збс', 'вообще', 'реально', 'серьезно', 'капец как',
      '🤩', '😍', '🚀', '💥', '⚡', '🤯', '😲', '😮'
    ];
    
    // Нейтральные/дружелюбные
    const friendlyWords = [
      'привет', 'здарова', 'хай', 'йо', 'салют', 'как дела', 'что делаешь',
      'как жизнь', 'что нового', 'давно не виделись'
    ];
    
    // Проверяем по категориям
    if (positiveWords.some(word => lowerText.includes(word))) return 'positive';
    if (negativeWords.some(word => lowerText.includes(word))) return 'negative';  
    if (excitedWords.some(word => lowerText.includes(word))) return 'excited';
    if (friendlyWords.some(word => lowerText.includes(word))) return 'friendly';
    
    // Дополнительные эвристики
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    const capsCount = (text.match(/[А-ЯA-Z]/g) || []).length;
    
    if (exclamationCount >= 2 || capsCount > text.length * 0.3) return 'excited';
    if (questionCount > 0) return 'curious';
    if (this.isDirectMention(text)) return 'engaging';
    
    // По умолчанию нейтральная эмоция
    return 'neutral';
  }

  /**
   * ЭТАП 9: Умное извлечение тем с использованием всех аналитических систем
   */
  private extractTopics(text: string, context?: {
    emotion?: string;
    imageAnalysis?: ImageAnalysisResult;
    memoryContext?: MemoryContext;
    detectedEvent?: any;
  }): string[] {
    const topics: string[] = [];
    
    // 1. ПРИОРИТЕТ: Темы из анализа изображений
    if (context?.imageAnalysis?.tags && context.imageAnalysis.tags.length > 0) {
      // Берем самые релевантные теги из анализа изображений
      const imageTags = context.imageAnalysis.tags
        .filter(tag => tag.length >= CONTENT_LIMITS.MIN_ENTITY_LENGTH && !['photo', 'image', 'picture'].includes(tag.toLowerCase()))
        .slice(0, CONTENT_LIMITS.MAX_ENTITIES_PER_MESSAGE);
      topics.push(...imageTags);
    }
    
    // 2. Темы из обнаруженных событий
    if (context?.detectedEvent?.tags) {
      const eventTopics = context.detectedEvent.tags
        .filter((tag: string) => !['celebration', 'conflict', 'funny_moment', 'decision', 'revelation'].includes(tag)) // исключаем типы событий
        .slice(0, 1);
      topics.push(...eventTopics);
    }
    
    // 3. Связь с активными темами чата
    if (context?.memoryContext?.activeTopics && context.memoryContext.activeTopics.length > 0) {
      const lowerText = text.toLowerCase();
      const relatedTopics = context.memoryContext.activeTopics
        .filter((topicObj: any) => {
          const topic = topicObj.topic.toLowerCase();
          return lowerText.includes(topic) || topic.includes(lowerText.substring(0, 10));
        })
        .map((topicObj: any) => topicObj.topic)
        .slice(0, 1);
      
      if (relatedTopics.length > 0) {
        topics.push(...relatedTopics);
      }
    }
    
    // 4. Распознавание сущностей в тексте (животные, предметы, места)
    const entities = this.extractEntities(text);
    if (entities.length > 0) {
      topics.push(...entities.slice(0, CONTENT_LIMITS.MAX_ENTITIES_PER_MESSAGE));
    }

    // 5. Эмоционально значимые темы
    if (context?.emotion && ['excited', 'angry', 'sad', 'funny'].includes(context.emotion)) {
      // Для эмоциональных сообщений пытаемся найти ключевые слова более тщательно
      const emotionalKeywords = this.extractEmotionalKeywords(text, context.emotion);
      topics.push(...emotionalKeywords.slice(0, 1));
    }
    
    // 6. Fallback: умный текстовый анализ (только если мало тем)
    if (topics.length < 2) {
      const textTopics = this.extractTopicsFromText(text);
      topics.push(...textTopics.slice(0, 2 - topics.length));
    }
    
    // Убираем дубли и возвращаем максимум тем
    const uniqueTopics = [...new Set(topics)].slice(0, CONTENT_LIMITS.MAX_TOPICS_PER_MESSAGE);
    
    return uniqueTopics;
  }

  /**
   * Распознает сущности в тексте (животные, предметы, места, люди)
   */
  private extractEntities(text: string): string[] {
    const lowerText = text.toLowerCase();
    const entities: string[] = [];
    
    // Словари сущностей
    const entityDictionaries = {
      animals: [
        'кот', 'кота', 'коте', 'коту', 'котом', 'кошка', 'кошку', 'кошке', 'кошки',
        'собака', 'собаку', 'собаке', 'собаки', 'собакой', 'пес', 'пса', 'псу', 'псом',
        'утка', 'утку', 'утке', 'утки', 'уткой', 'уток', 
        'птица', 'птицу', 'птице', 'птицы', 'птицей', 'птиц',
        'рыба', 'рыбу', 'рыбе', 'рыбы', 'рыбой', 'рыб',
        'ящерица', 'ящерицу', 'ящерице', 'ящерицы', 'ящерицей', 'ящериц',
        'хомяк', 'хомяка', 'хомяке', 'хомяку', 'хомяком', 'хомяки',
        'морской свинка', 'свинка', 'свинку', 'свинке', 'свинки', 'свинкой'
      ],
      
      plants: [
        'цветок', 'цветка', 'цветке', 'цветку', 'цветком', 'цветы', 'цветов',
        'растение', 'растения', 'растению', 'растением', 'растений',
        'мухоловка', 'мухоловку', 'мухоловке', 'мухоловки', 'мухоловкой',
        'кактус', 'кактуса', 'кактусе', 'кактусу', 'кактусом', 'кактусы'
      ],
      
      tech: [
        'телевизор', 'телевизора', 'телевизоре', 'телевизору', 'телевизором', 'телик', 'телика', 'телику',
        'компьютер', 'компьютера', 'компьютере', 'компьютеру', 'компьютером', 'комп', 'компа', 'компу',
        'телефон', 'телефона', 'телефоне', 'телефону', 'телефоном', 'мобильный', 'смартфон',
        'ноутбук', 'ноутбука', 'ноутбуке', 'ноутбуку', 'ноутбуком', 'лаптоп'
      ],
      
      places: [
        'египет', 'египта', 'египте', 'египту', 'египтом',
        'питер', 'питера', 'питере', 'питеру', 'питером', 'петербург',
        'москва', 'москвы', 'москве', 'москву', 'москвой',
        'украина', 'украины', 'украине', 'украину', 'украиной',
        'дом', 'дома', 'доме', 'дому', 'домом', 'квартира', 'квартиры', 'квартире'
      ],
      
      objects: [
        'кровать', 'кровати', 'кровате', 'кроватью', 'кроватей',
        'стол', 'стола', 'столе', 'столу', 'столом', 'столы',
        'машина', 'машины', 'машине', 'машину', 'машиной', 'авто', 'тачка', 'тачку', 'тачке',
        'картинг', 'картинга', 'картинге', 'картингу', 'картингом'
      ]
    };
    
    // Ищем совпадения по всем словарям
    for (const [category, words] of Object.entries(entityDictionaries)) {
      for (const word of words) {
        if (lowerText.includes(word)) {
          // Нормализуем к базовой форме
          const baseForm = this.normalizeEntityToBaseForm(word, category);
          if (baseForm && !entities.includes(baseForm)) {
            entities.push(baseForm);
          }
        }
      }
    }
    
    return entities.slice(0, 2); // Максимум 2 сущности
  }

  /**
   * Приводит сущность к базовой форме
   */
  private normalizeEntityToBaseForm(word: string, category: string): string {
    const normalizations: { [key: string]: { [key: string]: string } } = {
      animals: {
        'кот': 'кот', 'кота': 'кот', 'коте': 'кот', 'коту': 'кот', 'котом': 'кот',
        'кошка': 'кот', 'кошку': 'кот', 'кошке': 'кот', 'кошки': 'кот',
        'собака': 'собака', 'собаку': 'собака', 'собаке': 'собака', 'собаки': 'собака', 'собакой': 'собака',
        'пес': 'собака', 'пса': 'собака', 'псу': 'собака', 'псом': 'собака',
        'утка': 'утка', 'утку': 'утка', 'утке': 'утка', 'утки': 'утка', 'уткой': 'утка', 'уток': 'утка',
        'птица': 'птица', 'птицу': 'птица', 'птице': 'птица', 'птицы': 'птица', 'птицей': 'птица', 'птиц': 'птица',
        'ящерица': 'ящерица', 'ящерицу': 'ящерица', 'ящерице': 'ящерица', 'ящерицы': 'ящерица',
        'хомяк': 'хомяк', 'хомяка': 'хомяк', 'хомяке': 'хомяк', 'хомяку': 'хомяк', 'хомяком': 'хомяк', 'хомяки': 'хомяк'
      },
      plants: {
        'цветок': 'цветы', 'цветка': 'цветы', 'цветке': 'цветы', 'цветку': 'цветы', 'цветком': 'цветы', 'цветы': 'цветы', 'цветов': 'цветы',
        'растение': 'растения', 'растения': 'растения', 'растению': 'растения', 'растением': 'растения', 'растений': 'растения',
        'мухоловка': 'мухоловка', 'мухоловку': 'мухоловка', 'мухоловке': 'мухоловка', 'мухоловки': 'мухоловка'
      },
      tech: {
        'телевизор': 'телевизор', 'телевизора': 'телевизор', 'телевизоре': 'телевизор', 'телевизору': 'телевизор', 'телевизором': 'телевизор',
        'телик': 'телевизор', 'телика': 'телевизор', 'телику': 'телевизор',
        'компьютер': 'компьютер', 'компьютера': 'компьютер', 'компьютере': 'компьютер',
        'комп': 'компьютер', 'компа': 'компьютер', 'компу': 'компьютер'
      },
      places: {
        'египет': 'Египет', 'египта': 'Египет', 'египте': 'Египет', 'египту': 'Египет', 'египтом': 'Египет',
        'питер': 'Питер', 'питера': 'Питер', 'питере': 'Питер', 'петербург': 'Питер'
      },
      objects: {
        'кровать': 'кровать', 'кровати': 'кровать', 'кровате': 'кровать',
        'машина': 'машина', 'машины': 'машина', 'машине': 'машина', 'машину': 'машина',
        'авто': 'машина', 'тачка': 'машина', 'тачку': 'машина', 'тачке': 'машина',
        'картинг': 'картинг', 'картинга': 'картинг', 'картинге': 'картинг'
      }
    };
    
    return normalizations[category]?.[word] || word;
  }

  /**
   * Извлекает эмоционально значимые ключевые слова
   */
  private extractEmotionalKeywords(text: string, emotion: string): string[] {
    const lowerText = text.toLowerCase();
    const keywords: string[] = [];
    
    // Словари для разных эмоций
    const emotionalPatterns: { [key: string]: string[] } = {
      'excited': ['крут', 'супер', 'офиг', 'збс', 'ахуен', 'пизд', 'топ', 'огонь'],
      'funny': ['смех', 'ржак', 'прикол', 'умор', 'хохм', 'стеб', 'юмор'],
      'angry': ['злой', 'бесит', 'раздража', 'задолб', 'дост', 'херн', 'говн'],
      'sad': ['груст', 'печал', 'расстро', 'плох', 'тоск', 'жал']
    };
    
    const patterns = emotionalPatterns[emotion] || [];
    
    // Ищем слова, которые содержат эмоциональные корни
    const words = lowerText
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4);
    
    for (const word of words) {
      for (const pattern of patterns) {
        if (word.includes(pattern) && word.length >= 4) {
          keywords.push(word);
          break;
        }
      }
    }
    
    return keywords.slice(0, 1);
  }

  /**
   * Улучшенное извлечение тем из текста (fallback метод)
   */
  private extractTopicsFromText(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4);
    
    // Расширенный список стоп-слов (включая прилагательные)
    const topicStopWords = new Set([
      // Имена и обращения
      'саня', 'гейсандр', 'кулович', 'богдан', 'володя', 'вано', 'леня', 'максим',
      
      // Прилагательные и описательные слова
      'какой', 'такой', 'важный', 'хороший', 'плохой', 'большой', 'маленький',
      'красивый', 'умный', 'глупый', 'новый', 'старый', 'молодой',
      
      // Частые слова
      'вроде', 'думаю', 'норм', 'ваще', 'онлайн', 'реально', 'только', 'говорил', 'помню',
      'была', 'были', 'есть', 'будет', 'может', 'очень', 'тоже', 'тебя', 'меня', 'него',
      'этот', 'этого', 'этому', 'этой', 'этих', 'того', 'тому', 'теми', 'them',
      
      // Вопросительные и связки
      'который', 'которая', 'которое', 'которые', 'когда', 'почему', 'зачем', 'откуда',
      'чего', 'чему', 'чем', 'что', 'где', 'как', 'или', 'тем', 'для'
    ]);
    
    // Ищем потенциальные темы (существительные)
    const potentialTopics = words.filter(word => {
      // Исключаем стоп-слова
      if (topicStopWords.has(word)) return false;
      
      // Минимальная длина
      if (word.length < 5) return false;
      
      // Исключаем слова с повторяющимися символами (типа "ааааа")
      if (/(.)\1{2,}/.test(word)) return false;
      
      return true;
    });
    
    return potentialTopics.slice(0, 2);
  }

  /**
   * Извлекает упоминания пользователей
   */
  private extractMentions(text: string): string[] {
    const mentions = text.match(/@(\w+)/g);
    return mentions ? mentions.map(m => m.slice(1)) : [];
  }
  
  /**
   * Обновляет тему в базе данных
   */
  private updateTopicInDatabase(topic: string, author: string): void {
    if (!this.memoryManager || !this.chatId) return;
    
    try {
      // Проверяем если тема существует
      const existingTopic = (this.memoryManager as any).db.prepare(`
        SELECT * FROM chat_topics WHERE chat_id = ? AND topic = ?
      `).get(this.chatId, topic) as any;
      
      if (existingTopic) {
        // Обновляем существующую тему
        (this.memoryManager as any).db.prepare(`
          UPDATE chat_topics 
          SET last_mentioned = CURRENT_TIMESTAMP,
              mention_count = mention_count + 1,
              importance = MIN(1.0, importance + 0.1)
          WHERE chat_id = ? AND topic = ?
        `).run(this.chatId, topic);
      } else {
        // Создаем новую тему
        (this.memoryManager as any).db.prepare(`
          INSERT INTO chat_topics (
            chat_id, topic, first_mentioned, last_mentioned,
            mention_count, related_users, importance, status
          ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, ?, 0.5, 'active')
        `).run(this.chatId, topic, JSON.stringify([author]));
      }
    } catch (error) {
      Logger.error('Ошибка при обновлении темы:', error);
    }
  }


  /**
   * Проверяет является ли сообщение прямым обращением
   */
  private isDirectMention(text: string): boolean {
    const lowerText = text.toLowerCase();
    const botMentions = [
      'гейсандр', 'геясандр', 'гейс', 'геяс',
      'кулович', 'кулыч', 'кулич',
      'гейсандр кулович', 'геясандр кулович',
      'саня', 'саня', 'сань', 'санек', 'саник', 'санчо', 'шура', 'шурик',
      'александр', 'алекс', 'лекс', 'саша', 'сашка', 'сашок',
      '@'
    ];
    
    return botMentions.some(mention => lowerText.includes(mention));
  }

  /**
   * Находит наиболее подходящий паттерн для сообщения
   */
  private findMatchingPattern(messageText: string): TriggerPattern | null {
    const lowerText = messageText.toLowerCase();
    const matchingPatterns: Array<{ pattern: TriggerPattern; score: number }> = [];

    for (const pattern of this.personality.patterns) {
      let score = 0;
      
      for (const keyword of pattern.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          score += pattern.weight;
        }
      }

      if (score > 0) {
        matchingPatterns.push({ pattern, score });
      }
    }

    if (matchingPatterns.length === 0) return null;

    matchingPatterns.sort((a, b) => b.score - a.score);
    return matchingPatterns[0].pattern;
  }

  /**
   * Получить статистику контекста и памяти
   */
  getContextStats() {
    const baseStats = {
      recentMessagesCount: this.context.recentMessages.length,
      activeUsersCount: this.context.activeUsers.size,
      messagesSinceLastResponse: this.context.messagesSinceLastResponse,
      lastBotResponse: this.context.lastBotResponse,
      aiModel: this.aiEngine.getModelInfo(),
      aiMode: config.aiMode
    };

    // Добавляем статистику памяти
    if (this.memoryManager) {
      const memoryStats = this.memoryManager.getMemoryStats();
      return {
        ...baseStats,
        memory: memoryStats
      };
    }

    return baseStats;
  }

  /**
   * Возвращает последние сообщения из контекста для анализа изображений
   */
  public getRecentMessages(): string[] {
    return this.context.recentMessages.slice(-5).map(msg => `${msg.author}: ${msg.text}`);
  }

  /**
   * Возвращает профиль пользователя (заглушка для интеграции с AI engine)
   */
  public getUserProfile(userName: string): any | undefined {
    // Интеграция с профайлером будет добавлена позже
    return undefined;
  }

  /**
   * Возвращает личность бота
   */
  public getPersonality(): BotPersonality {
    return this.personality;
  }

  /**
   * Закрывает соединения
   */
  close(): void {
    if (this.memoryManager) {
      this.memoryManager.close();
    }
    if (this.activityManager) {
      this.activityManager.close();
    }
  }
}