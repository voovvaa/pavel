import { 
  BotPersonality, 
  TriggerPattern, 
  ChatContext,
  ImageAnalysisResult
} from '../core/types.js';
import { Logger } from '../utils/logger.js';
import { AIEngine } from './ai-engine.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { config } from '../core/config.js';

export class ResponseEngine {
  private personality: BotPersonality;
  private context: ChatContext;
  private aiEngine: AIEngine;
  private memoryManager: MemoryManager | null = null;
  private chatId: string | null = null;

  constructor(personality: BotPersonality, chatId?: string) {
    this.personality = personality;
    this.chatId = chatId || null;
    this.aiEngine = new AIEngine(personality, this.chatId || undefined);
    
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
   * Определяет нужно ли отвечать на сообщение
   */
  shouldRespond(messageText: string, author: string): boolean {
    // НЕ отвечаем на свои сообщения и если нас называют "ботом"
    if (author === 'Гейсандр Кулович' || author === 'bot') return false;
    
    // СТРОГО игнорируем если нас называют ботом
    const lowerText = messageText.toLowerCase();
    if (lowerText.includes('бот') || lowerText.includes('bot')) {
      Logger.debug('Игнорируем сообщение с упоминанием "бот" - Гейсандр не бот!');
      return false;
    }

    this.context.messagesSinceLastResponse++;

    // Проверяем прямое обращение к Гейсандру Куловичу
    if (this.isDirectMention(messageText)) {
      Logger.debug('Прямое обращение к Гейсандру Куловичу');
      return true;
    }

    // Проверяем активность по расписанию
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    if (!this.personality.schedule.activeHours.includes(currentHour) ||
        !this.personality.schedule.activeDays.includes(currentDay)) {
      Logger.debug('Гейсандр Кулович неактивен по расписанию');
      return false;
    }

    // В AI режиме более гибкая логика ответов
    if (this.aiEngine.isAvailable()) {
      const randomChance = Math.random();
      const shouldRespondChance = this.personality.responseStyle.activityLevel * 0.4;
      
      // Проверяем не слишком ли часто отвечаем
      if (this.context.lastBotResponse) {
        const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
        const minDelay = (1 - this.personality.responseStyle.activityLevel) * 180000;
        
        if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 2) {
          Logger.debug('Гейсандру Куловичу еще рано отвечать');
          return false;
        }
      }
      
      Logger.debug(`Гейсандр Кулович (AI с памятью): шанс ответа ${shouldRespondChance}, случайное: ${randomChance}`);
      return randomChance < shouldRespondChance;
    }

    // Классическая логика для паттернов
    const matchingPattern = this.findMatchingPattern(messageText);
    if (!matchingPattern) {
      Logger.debug('Гейсандр Кулович не нашел подходящий паттерн');
      return false;
    }

    if (this.context.lastBotResponse) {
      const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
      const minDelay = (1 - this.personality.responseStyle.activityLevel) * 300000;
      
      if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 3) {
        Logger.debug('Гейсандру Куловичу еще рано отвечать');
        return false;
      }
    }

    const randomChance = Math.random();
    const shouldRespondChance = this.personality.responseStyle.activityLevel * 0.3;
    
    Logger.debug(`Гейсандр Кулович (паттерны): шанс ответа ${shouldRespondChance}, случайное: ${randomChance}`);
    return randomChance < shouldRespondChance;
  }

  /**
   * Генерирует ответ используя AI или паттерны с памятью
   */
  async generateResponse(messageText: string, author: string, messageId?: number): Promise<string | null> {
    // Если есть память, строим контекст
    if (this.memoryManager) {
      try {
        Logger.debug(`💾 [ОТВЕТ] Начинаем построение контекста памяти...`);
        const memoryContext = await this.memoryManager.buildMemoryContext(messageText, author);
        this.context.memoryContext = memoryContext;
        Logger.info(`✅ [ОТВЕТ] Контекст памяти построен и передан в context`);
      } catch (error) {
        Logger.error('❌ [ОТВЕТ] Ошибка при построении контекста памяти:', error);
      }
    } else {
      Logger.warn(`⚠️ [ОТВЕТ] memoryManager отсутствует! Ответ будет без памяти.`);
    }
    const useAI = this.shouldUseAI(messageText);
    
    if (useAI && this.aiEngine.isAvailable()) {
      Logger.debug('Пытаемся генерировать ответ через AI с памятью...');
      const aiResponse = await this.aiEngine.generateResponse(messageText, author, this.context);
      
      if (aiResponse) {
        this.updateContext('Гейсандр Кулович', aiResponse, messageId);
        return aiResponse;
      } else {
        Logger.warn('AI не смог сгенерировать ответ, используем паттерны');
      }
    }

    // Fallback на паттерны
    Logger.debug('Генерируем ответ через паттерны...');
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

    // Оставляем только последние 10 сообщений
    if (this.context.recentMessages.length > 10) {
      this.context.recentMessages = this.context.recentMessages.slice(-10);
    }

    this.context.activeUsers.add(author);

    if (author === 'Гейсандр Кулович' || author === 'bot') {
      this.context.lastBotResponse = new Date();
      this.context.messagesSinceLastResponse = 0;
    }

    // Сохраняем в память если доступно
    Logger.debug(`Попытка сохранить в память: memoryManager=${!!this.memoryManager}, messageId=${messageId}, chatId=${this.chatId}`);
    
    if (this.memoryManager && messageId && this.chatId) {
      try {
        const importance = this.calculateMessageImportance(messageText, author);
        const emotion = this.detectEmotion(messageText);
        const topics = this.extractTopics(messageText);
        
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
        
        importantTopics.forEach(topic => {
          this.updateTopicInDatabase(topic, author);
        });
        
        Logger.debug(`Сохраняем сообщение: важность=${importance}, эмоция=${emotion}, темы=${JSON.stringify(topics)}, тип=${messageType}`);
        
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

        // Обновляем отношения с пользователем
        if (author !== 'Гейсандр Кулович') {
          this.memoryManager.updateUserRelationship(author, {
            commonTopics: topics,
            mood: (['positive', 'friendly', 'excited'].includes(emotion) ? 'positive' : 
                  ['negative', 'angry', 'sad'].includes(emotion) ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral'
          });
        }

        Logger.info(`✅ Сообщение сохранено в память: "${messageText.substring(0, 30)}..." от ${author}`);
      } catch (error) {
        Logger.error('❌ Ошибка сохранения в память:', error);
      }
    } else {
      Logger.warn(`⚠️ Не сохраняем в память: memoryManager=${!!this.memoryManager}, messageId=${messageId}, chatId=${this.chatId}`);
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
      importance += 0.3;
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
    return Math.min(1.0, Math.max(0.1, importance));
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
   * Извлекает темы из сообщения
   */
  private extractTopics(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4);
    
    // Фильтруем стоп-слова и имена для тем
    const topicStopWords = new Set([
      'саня', 'гейсандр', 'кулович', 'вроде', 'думаю', 'норм', 'ваще',
      'богдан', 'онлайн', 'реально', 'только', 'говорил', 'помню',
      'макс', 'ушел', 'была', 'были', 'есть', 'будет', 'может', 'очень'
    ]);
    
    return words
      .filter(word => !topicStopWords.has(word) && word.length >= 5)
      .slice(0, 2); // Только самые важные темы
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
        
        Logger.debug(`🎯 Новая тема создана: ${topic}`);
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
  }
}