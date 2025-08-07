import { 
  BotPersonality, 
  TriggerPattern, 
  ChatContext 
} from './types.js';
import { Logger } from './logger.js';

export class ResponseEngine {
  private personality: BotPersonality;
  private context: ChatContext;

  constructor(personality: BotPersonality) {
    this.personality = personality;
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
    // Не отвечаем на свои сообщения
    if (author === 'Гейсандр Кулович' || author === 'bot') return false;

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

    // Проверяем есть ли подходящий паттерн
    const matchingPattern = this.findMatchingPattern(messageText);
    if (!matchingPattern) {
      Logger.debug('Гейсандр Кулович не нашел подходящий паттерн');
      return false;
    }

    // Проверяем не слишком ли часто отвечаем
    if (this.context.lastBotResponse) {
      const timeSinceLastResponse = Date.now() - this.context.lastBotResponse.getTime();
      const minDelay = (1 - this.personality.responseStyle.activityLevel) * 300000; // 0-5 минут
      
      if (timeSinceLastResponse < minDelay && this.context.messagesSinceLastResponse < 3) {
        Logger.debug('Гейсандру Куловичу еще рано отвечать');
        return false;
      }
    }

    // Случайный фактор на основе активности
    const randomChance = Math.random();
    const shouldRespondChance = this.personality.responseStyle.activityLevel * 0.3; // 0-30% шанс
    
    Logger.debug(`Гейсандр Кулович: шанс ответа ${shouldRespondChance}, случайное: ${randomChance}`);
    return randomChance < shouldRespondChance;
  }

  /**
   * Генерирует ответ на основе паттернов
   */
  generateResponse(messageText: string): string | null {
    const pattern = this.findMatchingPattern(messageText);
    if (!pattern) return null;

    // Выбираем случайный ответ из паттерна
    const responses = pattern.responses;
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    Logger.info(`Выбран паттерн: ${pattern.id}, ответ: ${randomResponse.substring(0, 50)}...`);
    
    // Обновляем контекст
    this.updateContext('bot', randomResponse);
    
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
      'гейсандр', 'геясандр', 'гейс', 'геяс',
      'кулович', 'кулыч', 'кулич',
      'гейсандр кулович', 'геясандр кулович',
      'бот', 'bot', '@'
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
      lastBotResponse: this.context.lastBotResponse
    };
  }
}