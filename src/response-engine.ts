import { 
  BotPersonality, 
  TriggerPattern, 
  ChatContext 
} from './types.js';
import { Logger } from './logger.js';
import { AIEngine } from './ai-engine.js';
import { config } from './config.js';

export class ResponseEngine {
  private personality: BotPersonality;
  private context: ChatContext;
  private aiEngine: AIEngine;

  constructor(personality: BotPersonality) {
    this.personality = personality;
    this.aiEngine = new AIEngine(personality);
    this.context = {
      recentMessages: [],
      activeUsers: new Set(),
      messagesSinceLastResponse: 0
    };
  }

  /**
   * Определяет нужно ли отвечать на сообщение
   */
  shouldRespond(messageText: string, author: string): boolean {
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
      // AI может отвечать на более широкий спектр сообщений
      const randomChance = Math.random();
      const shouldRespondChance = this.personality.responseStyle.activityLevel * 0.4; // Увеличиваем шанс для AI
      
      // Проверяем не слишком ли часто отвечаем
      if (this.context.lastBotResponse) {
        const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
        const minDelay = (1 - this.personality.responseStyle.activityLevel) * 180000; // Уменьшаем задержку для AI
        
        if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 2) {
          Logger.debug('Гейсандру Куловичу еще рано отвечать');
          return false;
        }
      }
      
      Logger.debug(`Гейсандр Кулович (AI): шанс ответа ${shouldRespondChance}, случайное: ${randomChance}`);
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
   * Генерирует ответ используя AI или паттерны
   */
  async generateResponse(messageText: string, author: string): Promise<string | null> {
    const useAI = this.shouldUseAI(messageText);
    
    if (useAI && this.aiEngine.isAvailable()) {
      Logger.debug('Пытаемся генерировать ответ через AI...');
      const aiResponse = await this.aiEngine.generateResponse(messageText, author, this.context);
      
      if (aiResponse) {
        this.updateContext('Гейсандр Кулович', aiResponse);
        return aiResponse;
      } else {
        Logger.warn('AI не смог сгенерировать ответ, используем паттерны');
      }
    }

    // Fallback на паттерны или основной режим паттернов
    Logger.debug('Генерируем ответ через паттерны...');
    const patternResponse = this.generatePatternResponse(messageText);
    
    if (patternResponse) {
      this.updateContext('Гейсандр Кулович', patternResponse);
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
        // Прямые обращения всегда через AI
        if (this.isDirectMention(messageText)) {
          return true;
        }
        
        // Сложные сообщения лучше через AI
        if (messageText.length > 100 || messageText.includes('?')) {
          return Math.random() < config.aiProbability * 1.2; // Повышаем вероятность
        }
        
        // Обычные сообщения по настройке
        return Math.random() < config.aiProbability;
      default:
        return false;
    }
  }

  /**
   * Генерирует ответ на основе паттернов (старая логика)
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
   * Обновляет контекст разговора
   */
  updateContext(author: string, messageText: string): void {
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

    // Очищаем неактивных пользователей (старше 10 минут)
    const tenMinutesAgo = Date.now() - 600000;
    this.context.recentMessages = this.context.recentMessages.filter(
      msg => msg.timestamp.getTime() > tenMinutesAgo
    );
  }


  /**
   * Проверяет является ли сообщение прямым обращением к Гейсандру Куловичу
   */
  private isDirectMention(text: string): boolean {
    const lowerText = text.toLowerCase();
    const botMentions = [
      // Полное имя и вариации
      'гейсандр', 'геясандр', 'гейс', 'геяс',
      'кулович', 'кулыч', 'кулич',
      'гейсандр кулович', 'геясандр кулович',
      // Производные от Александр (Гейсандр = искаженный Александр)
      'саня', 'саня', 'сань', 'санек', 'саник', 'санчо', 'шура', 'шурик',
      'александр', 'алекс', 'лекс', 'саша', 'сашка', 'сашок',
      // Только @ для универсального обращения
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
      
      // Считаем совпадения ключевых слов
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

    // Возвращаем паттерн с наибольшим счетом
    matchingPatterns.sort((a, b) => b.score - a.score);
    return matchingPatterns[0].pattern;
  }

  /**
   * Получить статистику контекста (для отладки)
   */
  getContextStats() {
    return {
      recentMessagesCount: this.context.recentMessages.length,
      activeUsersCount: this.context.activeUsers.size,
      messagesSinceLastResponse: this.context.messagesSinceLastResponse,
      lastBotResponse: this.context.lastBotResponse,
      aiModel: this.aiEngine.getModelInfo(),
      aiMode: config.aiMode
    };
  }
}