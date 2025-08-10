/**
 * Трекер важных событий чата (ЭТАП 9)
 * 
 * Отслеживает и запоминает важные моменты в истории чата для
 * естественных упоминаний в будущих разговорах
 */

import { Database } from 'bun:sqlite';
import { Logger } from '../utils/logger.js';
import { config } from './config.js';
import { MemoryEntry } from './types.js';

export interface ChatEvent {
  id?: number;
  chatId: string;
  eventType: EventType;
  timestamp: Date;
  participants: string[];
  title: string;
  description: string;
  context: string;
  importance: number; // 0-1
  tags: string[];
  relatedMessageIds: number[];
  isRecurring: boolean;
  lastMentioned?: Date;
  mentionCount: number;
}

export type EventType = 
  | 'milestone'      // Важные достижения, годовщины
  | 'conflict'       // Конфликты и их разрешение
  | 'celebration'    // Праздники, дни рождения
  | 'departure'      // Уход/возвращение участников
  | 'topic_shift'    // Важные смены тем обсуждения
  | 'funny_moment'   // Смешные моменты
  | 'shared_experience' // Общие впечатления/события
  | 'decision'       // Важные решения группы
  | 'revelation'     // Откровения, важная личная информация
  | 'tradition';     // Традиции чата

export interface EventPattern {
  keywords: string[];
  emotionalMarkers: string[];
  contextClues: string[];
  minImportance: number;
  eventType: EventType;
}

export class EventTracker {
  private db: Database;
  private chatId: string;
  private patterns: EventPattern[] = [];

  constructor(chatId: string) {
    this.chatId = chatId;
    this.db = new Database(config.databasePath || './memory.db');
    this.initializeEventPatterns();
    this.initializeDatabase();
    
    Logger.info('📅 EventTracker инициализирован для чата ' + chatId);
  }

  /**
   * Инициализация базы данных для событий
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        participants TEXT NOT NULL, -- JSON array
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        context TEXT NOT NULL,
        importance REAL NOT NULL,
        tags TEXT NOT NULL, -- JSON array  
        related_message_ids TEXT NOT NULL, -- JSON array
        is_recurring BOOLEAN DEFAULT FALSE,
        last_mentioned DATETIME,
        mention_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для быстрого поиска
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_chat_timestamp ON chat_events(chat_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_type ON chat_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_importance ON chat_events(importance DESC);
    `);
  }

  /**
   * Инициализация паттернов для распознавания событий
   */
  private initializeEventPatterns(): void {
    this.patterns = [
      // Празднования и важные даты
      {
        keywords: ['день рождения', 'др', 'праздник', 'новый год', 'год', 'рождество', 'годовщина'],
        emotionalMarkers: ['поздравляю', 'поздравления', '🎉', '🎂', '🥳', '🎈'],
        contextClues: ['лет', 'исполняется', 'празднуем'],
        minImportance: 0.4,
        eventType: 'celebration'
      },
      
      // Конфликты и их разрешение
      {
        keywords: ['спор', 'конфликт', 'ссора', 'разногласие', 'извини', 'прости'],
        emotionalMarkers: ['злой', 'обиделся', 'расстроен', 'мирись', 'помирились'],
        contextClues: ['не прав', 'виноват', 'разберемся'],
        minImportance: 0.4,
        eventType: 'conflict'
      },

      // Уход/возвращение участников
      {
        keywords: ['ухожу', 'покидаю', 'прощайте', 'вернулся', 'снова здесь'],
        emotionalMarkers: ['грустно', 'скучали', 'рад видеть', 'соскучился'],
        contextClues: ['надолго', 'отпуск', 'командировка', 'больше не буду'],
        minImportance: 0.5,
        eventType: 'departure'
      },

      // Смешные моменты
      {
        keywords: ['ахахаха', 'умора', 'смешно', 'прикол', 'ржака', 'хахаха', 'ржу'],
        emotionalMarkers: ['😂', '🤣', '😄', 'лол', 'кек', 'хохма'],
        contextClues: ['не могу', 'убил', 'до слез'],
        minImportance: 0.3,
        eventType: 'funny_moment'
      },

      // Важные решения
      {
        keywords: ['решили', 'постановили', 'договорились', 'план', 'решение'],
        emotionalMarkers: ['согласны', 'единогласно', 'поддерживаю'],
        contextClues: ['итак', 'окончательно', 'больше не обсуждаем'],
        minImportance: 0.4,
        eventType: 'decision'
      },

      // Откровения и личная информация
      {
        keywords: ['признаюсь', 'скажу честно', 'по секрету', 'только вам', 'доверяю'],
        emotionalMarkers: ['серьезно', 'важно', 'переживаю', 'волнуюсь'],
        contextClues: ['никому не говорите', 'между нами'],
        minImportance: 0.5,
        eventType: 'revelation'
      }
    ];
  }

  /**
   * Анализирует сообщение на предмет важных событий
   */
  public analyzeMessage(message: MemoryEntry, context: MemoryEntry[]): ChatEvent | null {
    try {
      const content = message.content.toLowerCase();
      
      // Ищем совпадения с паттернами
      for (const pattern of this.patterns) {
        const score = this.calculatePatternMatch(content, pattern, context);
        
        if (score >= pattern.minImportance) {
          const event = this.createEventFromPattern(message, pattern, score, context);
          if (event) {
            Logger.debug(`📅 Обнаружено событие: ${event.eventType} - "${event.title}"`);
            return event;
          }
        }
      }
      
      return null;
    } catch (error) {
      Logger.error('Ошибка анализа события:', error);
      return null;
    }
  }

  /**
   * Рассчитывает соответствие сообщения паттерну
   */
  private calculatePatternMatch(content: string, pattern: EventPattern, context: MemoryEntry[]): number {
    let score = 0;
    
    // Проверяем ключевые слова
    const keywordMatches = pattern.keywords.filter(keyword => content.includes(keyword)).length;
    score += (keywordMatches / pattern.keywords.length) * 0.4;
    
    // Проверяем эмоциональные маркеры
    const emotionMatches = pattern.emotionalMarkers.filter(marker => content.includes(marker)).length;
    score += (emotionMatches / pattern.emotionalMarkers.length) * 0.3;
    
    // Проверяем контекстные подсказки
    const contextMatches = pattern.contextClues.filter(clue => content.includes(clue)).length;
    score += (contextMatches / pattern.contextClues.length) * 0.2;
    
    // Проверяем контекст из предыдущих сообщений
    if (context.length > 0) {
      const recentContent = context.slice(-3).map(m => m.content.toLowerCase()).join(' ');
      const contextKeywords = pattern.keywords.filter(keyword => recentContent.includes(keyword)).length;
      score += (contextKeywords / pattern.keywords.length) * 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Создает событие на основе паттерна
   */
  private createEventFromPattern(
    message: MemoryEntry,
    pattern: EventPattern,
    score: number,
    context: MemoryEntry[]
  ): ChatEvent {
    const participants = this.extractParticipants(message, context);
    const title = this.generateEventTitle(message, pattern);
    const description = this.generateEventDescription(message, pattern, context);
    const tags = this.extractTags(message, pattern);
    
    return {
      chatId: this.chatId,
      eventType: pattern.eventType,
      timestamp: message.timestamp,
      participants,
      title,
      description,
      context: message.content,
      importance: score,
      tags,
      relatedMessageIds: [message.messageId, ...context.slice(-2).map(m => m.messageId)],
      isRecurring: this.isRecurringEvent(pattern.eventType),
      mentionCount: 0
    };
  }

  /**
   * Извлекает участников события
   */
  private extractParticipants(message: MemoryEntry, context: MemoryEntry[]): string[] {
    const participants = new Set([message.author]);
    
    // Добавляем участников из контекста
    context.slice(-3).forEach(msg => participants.add(msg.author));
    
    // Добавляем упомянутых пользователей
    if (message.mentions) {
      message.mentions.forEach(mention => participants.add(mention));
    }
    
    return Array.from(participants);
  }

  /**
   * Генерирует заголовок события
   */
  private generateEventTitle(message: MemoryEntry, pattern: EventPattern): string {
    const content = message.content;
    const author = message.author;
    
    switch (pattern.eventType) {
      case 'celebration':
        if (content.toLowerCase().includes('день рождения')) {
          return `День рождения в чате`;
        }
        return `Празднование`;
        
      case 'conflict':
        return `Конфликт с участием ${author}`;
        
      case 'departure':
        if (content.toLowerCase().includes('вернулся')) {
          return `Возвращение ${author}`;
        }
        return `Уход ${author}`;
        
      case 'funny_moment':
        return `Смешной момент от ${author}`;
        
      case 'decision':
        return `Важное решение группы`;
        
      case 'revelation':
        return `Откровение ${author}`;
        
      default:
        return `Событие от ${author}`;
    }
  }

  /**
   * Генерирует описание события
   */
  private generateEventDescription(
    message: MemoryEntry,
    pattern: EventPattern,
    context: MemoryEntry[]
  ): string {
    const content = message.content.substring(0, 200);
    const contextText = context.slice(-2).map(m => 
      `${m.author}: ${m.content.substring(0, 100)}`
    ).join('\n');
    
    if (contextText) {
      return `Контекст:\n${contextText}\n\nСобытие:\n${message.author}: ${content}`;
    }
    
    return `${message.author}: ${content}`;
  }

  /**
   * Извлекает теги из сообщения
   */
  private extractTags(message: MemoryEntry, pattern: EventPattern): string[] {
    const tags = new Set<string>();
    
    // Добавляем тип события
    tags.add(pattern.eventType);
    
    // Добавляем автора
    tags.add(message.author);
    
    // Добавляем найденные ключевые слова
    const content = message.content.toLowerCase();
    pattern.keywords.forEach(keyword => {
      if (content.includes(keyword)) {
        tags.add(keyword);
      }
    });
    
    return Array.from(tags);
  }

  /**
   * Определяет является ли событие повторяющимся
   */
  private isRecurringEvent(eventType: EventType): boolean {
    return ['celebration', 'tradition'].includes(eventType);
  }

  /**
   * Сохраняет событие в базу данных
   */
  public saveEvent(event: ChatEvent): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO chat_events (
          chat_id, event_type, timestamp, participants, title, description,
          context, importance, tags, related_message_ids, is_recurring, mention_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        event.chatId,
        event.eventType,
        event.timestamp.toISOString(),
        JSON.stringify(event.participants),
        event.title,
        event.description,
        event.context,
        event.importance,
        JSON.stringify(event.tags),
        JSON.stringify(event.relatedMessageIds),
        event.isRecurring,
        event.mentionCount
      );
      
      Logger.info(`📅 Событие сохранено: ${event.title} (ID: ${result.lastInsertRowid})`);
      return result.lastInsertRowid as number;
      
    } catch (error) {
      Logger.error('Ошибка сохранения события:', error);
      return -1;
    }
  }

  /**
   * Получает релевантные события для контекста
   */
  public getRelevantEvents(keywords: string[], limit = 5): ChatEvent[] {
    try {
      const keywordPattern = keywords.join('|');
      
      const events = this.db.prepare(`
        SELECT * FROM chat_events 
        WHERE chat_id = ? 
          AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)
        ORDER BY importance DESC, timestamp DESC 
        LIMIT ?
      `).all(
        this.chatId,
        `%${keywordPattern}%`,
        `%${keywordPattern}%`, 
        `%${keywordPattern}%`,
        limit
      ) as any[];
      
      return events.map(this.mapRowToEvent);
    } catch (error) {
      Logger.error('Ошибка получения событий:', error);
      return [];
    }
  }

  /**
   * Получает события по типу
   */
  public getEventsByType(eventType: EventType, limit = 10): ChatEvent[] {
    try {
      const events = this.db.prepare(`
        SELECT * FROM chat_events 
        WHERE chat_id = ? AND event_type = ?
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(this.chatId, eventType, limit) as any[];
      
      return events.map(this.mapRowToEvent);
    } catch (error) {
      Logger.error('Ошибка получения событий по типу:', error);
      return [];
    }
  }

  /**
   * Получает недавние важные события
   */
  public getRecentImportantEvents(days = 30, minImportance = 0.6): ChatEvent[] {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      
      const events = this.db.prepare(`
        SELECT * FROM chat_events 
        WHERE chat_id = ? 
          AND timestamp >= ?
          AND importance >= ?
        ORDER BY importance DESC, timestamp DESC 
        LIMIT 10
      `).all(this.chatId, dateLimit.toISOString(), minImportance) as any[];
      
      return events.map(this.mapRowToEvent);
    } catch (error) {
      Logger.error('Ошибка получения важных событий:', error);
      return [];
    }
  }

  /**
   * Отмечает упоминание события
   */
  public markEventMentioned(eventId: number): void {
    try {
      this.db.prepare(`
        UPDATE chat_events 
        SET last_mentioned = datetime('now'), mention_count = mention_count + 1
        WHERE id = ?
      `).run(eventId);
    } catch (error) {
      Logger.error('Ошибка отметки упоминания события:', error);
    }
  }

  /**
   * Преобразует строку БД в объект события
   */
  private mapRowToEvent(row: any): ChatEvent {
    return {
      id: row.id,
      chatId: row.chat_id,
      eventType: row.event_type as EventType,
      timestamp: new Date(row.timestamp),
      participants: JSON.parse(row.participants),
      title: row.title,
      description: row.description,
      context: row.context,
      importance: row.importance,
      tags: JSON.parse(row.tags),
      relatedMessageIds: JSON.parse(row.related_message_ids),
      isRecurring: row.is_recurring,
      lastMentioned: row.last_mentioned ? new Date(row.last_mentioned) : undefined,
      mentionCount: row.mention_count
    };
  }

  /**
   * Получает события по временному периоду
   */
  public getEventsByPeriod(days: number = 7): ChatEvent[] {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      
      const events = this.db.prepare(`
        SELECT * FROM chat_events 
        WHERE chat_id = ? 
          AND timestamp >= ?
        ORDER BY timestamp DESC 
        LIMIT 20
      `).all(this.chatId, dateLimit.toISOString()) as any[];
      
      return events.map(this.mapRowToEvent);
    } catch (error) {
      Logger.error('Ошибка получения событий по периоду:', error);
      return [];
    }
  }

  /**
   * Получает статистику событий для долгосрочного анализа
   */
  public getEventStats(): any {
    try {
      const stats: any = {};
      
      // Общее количество событий
      const totalResult = this.db.prepare(`
        SELECT COUNT(*) as count FROM chat_events WHERE chat_id = ?
      `).get(this.chatId) as any;
      stats.totalEvents = totalResult?.count || 0;
      
      // События по типам
      const typeStats = this.db.prepare(`
        SELECT event_type, COUNT(*) as count 
        FROM chat_events 
        WHERE chat_id = ? 
        GROUP BY event_type 
        ORDER BY count DESC
      `).all(this.chatId) as any[];
      
      stats.eventsByType = typeStats.reduce((acc, row) => {
        acc[row.event_type] = row.count;
        return acc;
      }, {});
      
      // Средняя важность
      const avgImportance = this.db.prepare(`
        SELECT AVG(importance) as avg_importance 
        FROM chat_events 
        WHERE chat_id = ?
      `).get(this.chatId) as any;
      stats.averageImportance = avgImportance?.avg_importance || 0.5;
      
      // События за последнюю неделю
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const recentResult = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM chat_events 
        WHERE chat_id = ? AND timestamp >= ?
      `).get(this.chatId, weekAgo.toISOString()) as any;
      stats.recentEvents = recentResult?.count || 0;
      
      return stats;
    } catch (error) {
      Logger.error('Ошибка получения статистики событий:', error);
      return { totalEvents: 0, eventsByType: {}, averageImportance: 0.5, recentEvents: 0 };
    }
  }

  /**
   * Получает памятные события для упоминания в разговоре
   */
  public getMemorableEvents(limit = 5): ChatEvent[] {
    try {
      // Ищем события с высокой важностью, которые давно не упоминались
      const events = this.db.prepare(`
        SELECT * FROM chat_events 
        WHERE chat_id = ? 
          AND importance >= 0.7
          AND (last_mentioned IS NULL OR last_mentioned < datetime('now', '-3 days'))
        ORDER BY importance DESC, timestamp DESC 
        LIMIT ?
      `).all(this.chatId, limit) as any[];
      
      return events.map(this.mapRowToEvent);
    } catch (error) {
      Logger.error('Ошибка получения памятных событий:', error);
      return [];
    }
  }

  /**
   * Архивирует старые события низкой важности
   */
  public archiveOldEvents(days = 90): number {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      
      const result = this.db.prepare(`
        DELETE FROM chat_events 
        WHERE chat_id = ? 
          AND timestamp < ?
          AND importance < 0.6
          AND mention_count = 0
      `).run(this.chatId, dateLimit.toISOString());
      
      const deletedCount = (result as any).changes || 0;
      if (deletedCount > 0) {
        Logger.info(`📅 Архивировано ${deletedCount} старых событий низкой важности`);
      }
      
      return deletedCount;
    } catch (error) {
      Logger.error('Ошибка архивации событий:', error);
      return 0;
    }
  }

  /**
   * Закрытие трекера
   */
  public close(): void {
    // База данных закрывается автоматически с MemoryManager
    Logger.debug('📅 EventTracker закрыт');
  }
}