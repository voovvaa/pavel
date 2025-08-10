/**
 * Менеджер активности - динамическая адаптация расписания бота (ЭТАП 9)
 * 
 * Анализирует реальную активность в чате и адаптирует поведение бота
 * в реальном времени, а не только на основе статических данных
 */

import { Database } from 'bun:sqlite';
import { Logger } from '../utils/logger.js';
import { config } from './config.js';

export interface ActivityPattern {
  currentHour: number;
  currentDay: number;
  hourlyActivity: { [hour: number]: number };  // активность по часам за последние 7 дней
  weeklyActivity: { [day: number]: number };   // активность по дням за последние 4 недели
  recentTrend: 'increasing' | 'decreasing' | 'stable'; // тренд активности
  lastUpdate: Date;
}

export interface ActivityModifiers {
  responseMultiplier: number;    // 0.1-3.0 - множитель вероятности ответа
  delayMultiplier: number;       // 0.5-2.0 - множитель задержки перед ответом
  isActiveTime: boolean;         // активное время сейчас?
  inactivityPeriod: number;      // минут с последнего сообщения в чате
}

export class ActivityManager {
  private db: Database;
  private chatId: string;
  private activityPattern: ActivityPattern;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(chatId: string) {
    this.chatId = chatId;
    this.db = new Database(config.databasePath || './memory.db');
    
    this.activityPattern = {
      currentHour: new Date().getHours(),
      currentDay: new Date().getDay(),
      hourlyActivity: {},
      weeklyActivity: {},
      recentTrend: 'stable',
      lastUpdate: new Date()
    };

    this.initializeActivityTracking();
    this.startPeriodicUpdate();
    
    Logger.info('📊 ActivityManager инициализирован для чата ' + chatId);
  }

  /**
   * Инициализация отслеживания активности
   */
  private initializeActivityTracking(): void {
    this.updateActivityPattern();
  }

  /**
   * Запуск периодического обновления каждые 15 минут
   */
  private startPeriodicUpdate(): void {
    // Обновляем каждые 15 минут
    this.checkInterval = setInterval(() => {
      this.updateActivityPattern();
    }, 15 * 60 * 1000);
  }

  /**
   * Обновляет паттерн активности на основе реальных данных
   */
  public updateActivityPattern(): void {
    try {
      const now = new Date();
      this.activityPattern.currentHour = now.getHours();
      this.activityPattern.currentDay = now.getDay();
      
      // Анализируем активность по часам за последние 7 дней
      this.activityPattern.hourlyActivity = this.analyzeHourlyActivity();
      
      // Анализируем активность по дням за последние 4 недели
      this.activityPattern.weeklyActivity = this.analyzeWeeklyActivity();
      
      // Определяем тренд
      this.activityPattern.recentTrend = this.calculateActivityTrend();
      
      this.activityPattern.lastUpdate = now;
      
      Logger.debug(`📊 Паттерн активности обновлен. Текущий час: ${this.activityPattern.currentHour}, тренд: ${this.activityPattern.recentTrend}`);
      
    } catch (error) {
      Logger.error('Ошибка обновления паттерна активности:', error);
    }
  }

  /**
   * Анализ активности по часам за последние 7 дней
   */
  private analyzeHourlyActivity(): { [hour: number]: number } {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const hourlyStats = this.db.prepare(`
      SELECT 
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? 
        AND is_from_bot = 0 
        AND timestamp >= ?
        AND timestamp <= datetime('now')
      GROUP BY hour
      ORDER BY hour
    `).all(this.chatId, sevenDaysAgo.toISOString()) as { hour: number; count: number }[];

    // Инициализируем все часы
    const hourlyActivity: { [hour: number]: number } = {};
    for (let i = 0; i < 24; i++) {
      hourlyActivity[i] = 0;
    }
    
    // Заполняем данными
    hourlyStats.forEach(stat => {
      hourlyActivity[stat.hour] = stat.count;
    });

    return hourlyActivity;
  }

  /**
   * Анализ активности по дням за последние 4 недели
   */
  private analyzeWeeklyActivity(): { [day: number]: number } {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    
    const weeklyStats = this.db.prepare(`
      SELECT 
        CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
        COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? 
        AND is_from_bot = 0 
        AND timestamp >= ?
        AND timestamp <= datetime('now')
      GROUP BY day_of_week
      ORDER BY day_of_week
    `).all(this.chatId, fourWeeksAgo.toISOString()) as { day_of_week: number; count: number }[];

    // Инициализируем все дни
    const weeklyActivity: { [day: number]: number } = {};
    for (let i = 0; i < 7; i++) {
      weeklyActivity[i] = 0;
    }
    
    // Заполняем данными
    weeklyStats.forEach(stat => {
      weeklyActivity[stat.day_of_week] = stat.count;
    });

    return weeklyActivity;
  }

  /**
   * Рассчитывает тренд активности (сравнивает последние 3 дня с предыдущими 4 днями)
   */
  private calculateActivityTrend(): 'increasing' | 'decreasing' | 'stable' {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Последние 3 дня
    const recent = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? 
        AND is_from_bot = 0 
        AND timestamp >= ?
        AND timestamp <= datetime('now')
    `).get(this.chatId, threeDaysAgo.toISOString()) as { count: number } | undefined;

    // Предыдущие 4 дня (7-3 дня назад)  
    const previous = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? 
        AND is_from_bot = 0 
        AND timestamp >= ?
        AND timestamp < ?
    `).get(this.chatId, sevenDaysAgo.toISOString(), threeDaysAgo.toISOString()) as { count: number } | undefined;

    const recentCount = recent?.count || 0;
    const previousCount = previous?.count || 0;
    
    if (previousCount === 0) return 'stable';
    
    const recentPerDay = recentCount / 3;
    const previousPerDay = previousCount / 4;
    const changeRatio = (recentPerDay - previousPerDay) / previousPerDay;

    if (changeRatio > 0.2) return 'increasing';
    if (changeRatio < -0.2) return 'decreasing';
    return 'stable';
  }

  /**
   * Получает модификаторы активности для текущего момента
   */
  public getActivityModifiers(): ActivityModifiers {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    // Базовая активность для текущего часа
    const hourlyActivity = this.activityPattern.hourlyActivity[currentHour] || 0;
    const maxHourlyActivity = Math.max(...Object.values(this.activityPattern.hourlyActivity));
    const hourActivity = maxHourlyActivity > 0 ? hourlyActivity / maxHourlyActivity : 0.5;

    // Базовая активность для текущего дня недели
    const weeklyActivity = this.activityPattern.weeklyActivity[currentDay] || 0;
    const maxWeeklyActivity = Math.max(...Object.values(this.activityPattern.weeklyActivity));
    const dayActivity = maxWeeklyActivity > 0 ? weeklyActivity / maxWeeklyActivity : 0.5;

    // Комбинированная активность
    const combinedActivity = (hourActivity * 0.7) + (dayActivity * 0.3);

    // Определяем активное время (выше 30% от максимума)
    const isActiveTime = combinedActivity > 0.3;

    // Рассчитываем множители
    let responseMultiplier = 0.5 + (combinedActivity * 1.5); // 0.5-2.0
    let delayMultiplier = 2.0 - (combinedActivity * 1.0); // 1.0-2.0

    // Корректируем по тренду
    switch (this.activityPattern.recentTrend) {
      case 'increasing':
        responseMultiplier *= 1.2;
        delayMultiplier *= 0.8;
        break;
      case 'decreasing':
        responseMultiplier *= 0.8;
        delayMultiplier *= 1.2;
        break;
      // 'stable' не требует корректировок
    }

    // Ограничиваем диапазоны
    responseMultiplier = Math.max(0.1, Math.min(3.0, responseMultiplier));
    delayMultiplier = Math.max(0.5, Math.min(2.0, delayMultiplier));

    // Проверяем время неактивности чата
    const inactivityPeriod = this.getInactivityPeriod();

    return {
      responseMultiplier,
      delayMultiplier,
      isActiveTime,
      inactivityPeriod
    };
  }

  /**
   * Получает время неактивности чата в минутах
   */
  private getInactivityPeriod(): number {
    const lastMessage = this.db.prepare(`
      SELECT MAX(timestamp) as last_timestamp
      FROM messages 
      WHERE chat_id = ? AND is_from_bot = 0
    `).get(this.chatId) as { last_timestamp: string } | undefined;

    if (!lastMessage?.last_timestamp) return 0;

    const lastMessageTime = new Date(lastMessage.last_timestamp);
    const now = new Date();
    const diffMs = now.getTime() - lastMessageTime.getTime();
    
    return Math.floor(diffMs / (1000 * 60)); // в минутах
  }

  /**
   * Получает статистику активности для логирования
   */
  public getActivityStats(): string {
    const modifiers = this.getActivityModifiers();
    const currentHour = this.activityPattern.currentHour;
    const hourActivity = this.activityPattern.hourlyActivity[currentHour] || 0;
    
    return `час ${currentHour}: ${hourActivity} сообщений, множитель ${modifiers.responseMultiplier.toFixed(2)}x, ${modifiers.isActiveTime ? 'активное' : 'спокойное'} время, неактивность ${modifiers.inactivityPeriod}мин`;
  }

  /**
   * Закрытие менеджера
   */
  public close(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    Logger.info('📊 ActivityManager закрыт');
  }
}