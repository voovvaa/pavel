import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { 
  MemoryEntry, 
  ConversationSummary, 
  UserRelationship, 
  ChatTopic, 
  MemoryContext 
} from '../core/types.js';

export class MemoryManager {
  private db: Database;
  private chatId: string;

  constructor(chatId: string) {
    this.chatId = chatId;
    this.db = new Database(config.databasePath || './memory.db');
    this.initializeDatabase();
    
    // Исправляем счетчики дней при первом запуске (убираем setTimeout чтобы избежать проблем с закрытой БД)
    try {
      this.fixInteractionCounts();
    } catch (error) {
      Logger.warn('Не удалось исправить счетчики дней:', error);
    }
  }

  /**
   * Инициализация базы данных
   */
  private initializeDatabase(): void {
    // Таблица сообщений
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        message_type TEXT DEFAULT 'text',
        is_from_bot BOOLEAN DEFAULT FALSE,
        context TEXT,
        importance REAL DEFAULT 0.5,
        emotion TEXT,
        topics TEXT, -- JSON array
        mentions TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сводок разговоров
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        date_start DATETIME NOT NULL,
        date_end DATETIME NOT NULL,
        participants TEXT NOT NULL, -- JSON array
        main_topics TEXT NOT NULL, -- JSON array
        key_events TEXT NOT NULL, -- JSON array
        mood TEXT,
        summary TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица отношений с пользователями
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        relationship TEXT DEFAULT 'unknown',
        last_interaction DATETIME NOT NULL,
        interaction_count INTEGER DEFAULT 1,
        common_topics TEXT, -- JSON array
        personal_notes TEXT, -- JSON array
        mood TEXT DEFAULT 'neutral',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_name)
      )
    `);

    // Таблица тем чата
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        first_mentioned DATETIME NOT NULL,
        last_mentioned DATETIME NOT NULL,
        mention_count INTEGER DEFAULT 1,
        related_users TEXT, -- JSON array
        importance REAL DEFAULT 0.5,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, topic)
      )
    `);

    // Индексы для производительности
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(chat_id, author);
      CREATE INDEX IF NOT EXISTS idx_topics_chat ON chat_topics(chat_id, status);
      CREATE INDEX IF NOT EXISTS idx_relationships_chat ON user_relationships(chat_id);
    `);

    Logger.info('База данных памяти инициализирована');
  }

  /**
   * Сохраняет сообщение в память
   */
  saveMessage(entry: Omit<MemoryEntry, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        chat_id, message_id, author, content, timestamp, 
        message_type, is_from_bot, context, importance, 
        emotion, topics, mentions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.chatId,
      entry.messageId,
      entry.author,
      entry.content,
      entry.timestamp.toISOString(),
      entry.messageType,
      entry.isFromBot ? 1 : 0,
      entry.context || null,
      entry.importance,
      entry.emotion || null,
      entry.topics ? JSON.stringify(entry.topics) : null,
      entry.mentions ? JSON.stringify(entry.mentions) : null
    );

    // В Bun SQLite lastInsertRowid доступен непосредственно из результата
    return (result as any).lastInsertRowid || this.db.lastInsertRowid || 1;
  }

  /**
   * Получает недавние сообщения
   */
  getRecentMessages(limit: number = 20): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE chat_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(this.chatId, limit) as any[];
    return rows.map(this.rowToMemoryEntry).reverse(); // Возвращаем в хронологическом порядке
  }

  /**
   * Ищет релевантные сообщения по ключевым словам
   */
  findRelevantMessages(keywords: string[], limit: number = 10): MemoryEntry[] {
    if (keywords.length === 0) return [];

    const keywordPattern = keywords.map(k => `%${k.toLowerCase()}%`).join('|');
    
    const stmt = this.db.prepare(`
      SELECT *, 
        (CASE 
          WHEN lower(content) LIKE ? THEN importance + 0.3
          ELSE importance 
        END) as relevance_score
      FROM messages 
      WHERE chat_id = ? 
        AND (${keywords.map(() => 'lower(content) LIKE ?').join(' OR ')})
        AND timestamp > datetime('now', '-${config.memoryDays || 30} days')
      ORDER BY relevance_score DESC, timestamp DESC
      LIMIT ?
    `);

    const params = [keywordPattern, this.chatId, ...keywords.map(k => `%${k.toLowerCase()}%`), limit];
    const rows = stmt.all(...params) as any[];
    
    return rows.map(this.rowToMemoryEntry);
  }

  /**
   * Получает информацию о пользователе
   */
  getUserRelationship(userName: string): UserRelationship | null {
    const stmt = this.db.prepare(`
      SELECT * FROM user_relationships 
      WHERE chat_id = ? AND user_name = ?
    `);

    const row = stmt.get(this.chatId, userName) as any;
    if (!row) return null;

    return {
      id: row.id,
      chatId: row.chat_id,
      userName: row.user_name,
      relationship: row.relationship,
      lastInteraction: new Date(row.last_interaction),
      interactionCount: row.interaction_count,
      commonTopics: row.common_topics ? JSON.parse(row.common_topics) : [],
      personalNotes: row.personal_notes ? JSON.parse(row.personal_notes) : [],
      mood: row.mood
    };
  }

  /**
   * Обновляет или создает отношения с пользователем
   */
  updateUserRelationship(userName: string, updates: Partial<UserRelationship>): void {
    const existing = this.getUserRelationship(userName);
    const now = new Date();
    
    if (existing) {
      // Проверяем, был ли уже контакт сегодня
      const lastInteractionDate = existing.lastInteraction.toDateString();
      const todayDate = now.toDateString();
      const isNewDay = lastInteractionDate !== todayDate;
      
      // Обновляем существующую запись
      const stmt = this.db.prepare(`
        UPDATE user_relationships 
        SET last_interaction = ?, 
            interaction_count = CASE WHEN ? THEN interaction_count + 1 ELSE interaction_count END,
            common_topics = ?,
            personal_notes = ?,
            mood = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE chat_id = ? AND user_name = ?
      `);

      stmt.run(
        now.toISOString(),
        isNewDay ? 1 : 0, // Увеличиваем счетчик только если новый день
        JSON.stringify(updates.commonTopics || existing.commonTopics),
        JSON.stringify(updates.personalNotes || existing.personalNotes),
        updates.mood || existing.mood,
        this.chatId,
        userName
      );
      
      if (isNewDay) {
        Logger.debug(`📅 Новый день взаимодействия с ${userName} (день ${existing.interactionCount + 1})`);
      }
    } else {
      // Создаем новую запись (первый день взаимодействия)
      const stmt = this.db.prepare(`
        INSERT INTO user_relationships (
          chat_id, user_name, relationship, last_interaction,
          interaction_count, common_topics, personal_notes, mood
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        this.chatId,
        userName,
        updates.relationship || 'unknown',
        now.toISOString(),
        1, // Первый день взаимодействия
        JSON.stringify(updates.commonTopics || []),
        JSON.stringify(updates.personalNotes || []),
        updates.mood || 'neutral'
      );
      
      Logger.debug(`👋 Новый пользователь ${userName} - день 1 знакомства`);
    }
  }

  /**
   * Получает активные темы чата
   */
  getActiveTopics(limit: number = 10): ChatTopic[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chat_topics 
      WHERE chat_id = ? AND status = 'active'
      ORDER BY importance DESC, last_mentioned DESC
      LIMIT ?
    `);

    const rows = stmt.all(this.chatId, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id,
      topic: row.topic,
      firstMentioned: new Date(row.first_mentioned),
      lastMentioned: new Date(row.last_mentioned),
      mentionCount: row.mention_count,
      relatedUsers: row.related_users ? JSON.parse(row.related_users) : [],
      importance: row.importance,
      status: row.status
    }));
  }

  /**
   * Создает контекст памяти для AI
   */
  async buildMemoryContext(currentMessage: string, author: string): Promise<MemoryContext> {
    Logger.debug(`🧠 [ПАМЯТЬ] Строим контекст памяти для сообщения: "${currentMessage.substring(0, 50)}..." от ${author}`);
    
    // Получаем недавние сообщения (меньше для GPT-5)
    const recentMessages = this.getRecentMessages(5);
    Logger.debug(`🧠 [ПАМЯТЬ] Недавние сообщения: ${recentMessages.length} штук`);
    
    // Извлекаем ключевые слова из текущего сообщения
    const keywords = this.extractKeywords(currentMessage);
    Logger.debug(`🧠 [ПАМЯТЬ] Ключевые слова: ${JSON.stringify(keywords)}`);
    
    // Ищем релевантную историю (минимум для GPT-5)
    const relevantHistory = this.findRelevantMessages(keywords, 1);
    Logger.debug(`🧠 [ПАМЯТЬ] Релевантная история: ${relevantHistory.length} сообщений`);
    
    // Получаем сводки недавних разговоров
    const conversationSummaries = this.getRecentSummaries(5);
    Logger.debug(`🧠 [ПАМЯТЬ] Сводки разговоров: ${conversationSummaries.length} штук`);
    
    // Получаем отношения с пользователями
    const userRelationships = new Map<string, UserRelationship>();
    const relationship = this.getUserRelationship(author);
    if (relationship) {
      userRelationships.set(author, relationship);
      Logger.debug(`🧠 [ПАМЯТЬ] Отношения с ${author}: ${relationship.relationship}, взаимодействий: ${relationship.interactionCount}`);
    } else {
      Logger.debug(`🧠 [ПАМЯТЬ] Отношения с ${author}: не найдены`);
    }
    
    // Получаем активные темы
    const activeTopics = this.getActiveTopics();
    Logger.debug(`🧠 [ПАМЯТЬ] Активные темы: ${activeTopics.map(t => t.topic).join(', ')}`);

    const currentMood = this.analyzeCurrentMood(recentMessages);
    Logger.debug(`🧠 [ПАМЯТЬ] Текущее настроение: ${currentMood}`);

    const memoryContext = {
      recentMessages,
      relevantHistory,
      conversationSummaries,
      userRelationships,
      activeTopics,
      currentMood
    };
    
    Logger.info(`✅ [ПАМЯТЬ] Контекст построен: ${recentMessages.length} недавних, ${relevantHistory.length} релевантных, ${activeTopics.length} тем`);
    return memoryContext;
  }

  /**
   * Извлекает ключевые слова из сообщения
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3);
    
    // Простая фильтрация стоп-слов
    const stopWords = new Set(['что', 'как', 'где', 'когда', 'это', 'тот', 'для', 'или']);
    
    return words
      .filter(word => !stopWords.has(word))
      .slice(0, 5); // Берем первые 5 ключевых слов
  }

  /**
   * Анализирует текущее настроение чата
   */
  private analyzeCurrentMood(recentMessages: MemoryEntry[]): string {
    if (recentMessages.length === 0) return 'neutral';
    
    const emotions = recentMessages
      .filter(msg => msg.emotion)
      .map(msg => msg.emotion!);
    
    if (emotions.length === 0) return 'neutral';
    
    // Простая логика определения настроения
    const positiveCount = emotions.filter(e => ['positive', 'excited', 'funny'].includes(e)).length;
    const negativeCount = emotions.filter(e => ['negative', 'angry', 'sad'].includes(e)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Получает недавние сводки разговоров
   */
  private getRecentSummaries(limit: number): ConversationSummary[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_summaries 
      WHERE chat_id = ? 
      ORDER BY date_end DESC 
      LIMIT ?
    `);

    const rows = stmt.all(this.chatId, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id,
      dateStart: new Date(row.date_start),
      dateEnd: new Date(row.date_end),
      participants: JSON.parse(row.participants),
      mainTopics: JSON.parse(row.main_topics),
      keyEvents: JSON.parse(row.key_events),
      mood: row.mood,
      summary: row.summary,
      messageCount: row.message_count
    }));
  }

  /**
   * Преобразует строку БД в MemoryEntry
   */
  private rowToMemoryEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      chatId: row.chat_id,
      messageId: row.message_id,
      author: row.author,
      content: row.content,
      timestamp: new Date(row.timestamp),
      messageType: row.message_type,
      isFromBot: Boolean(row.is_from_bot),
      context: row.context,
      importance: row.importance,
      emotion: row.emotion,
      topics: row.topics ? JSON.parse(row.topics) : undefined,
      mentions: row.mentions ? JSON.parse(row.mentions) : undefined
    };
  }

  /**
   * Очищает старую память (вызывается периодически)
   */
  cleanupOldMemory(): void {
    const memoryDays = config.memoryDays || 30;
    
    // Удаляем старые сообщения (оставляем только важные)
    this.db.exec(`
      DELETE FROM messages 
      WHERE chat_id = '${this.chatId}' 
        AND timestamp < datetime('now', '-${memoryDays} days')
        AND importance < 0.7
    `);

    // Архивируем старые темы
    this.db.exec(`
      UPDATE chat_topics 
      SET status = 'archived' 
      WHERE chat_id = '${this.chatId}' 
        AND last_mentioned < datetime('now', '-${Math.floor(memoryDays/2)} days')
        AND status = 'active'
    `);

    Logger.info('Очистка старой памяти завершена');
  }

  /**
   * Получает статистику памяти
   */
  getMemoryStats(): any {
    const stats: any = {};
    
    // Количество сообщений
    const messagesResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE chat_id = ?
    `).get(this.chatId) as any;
    stats.totalMessages = messagesResult?.count || 0;

    // Количество пользователей
    const usersResult = this.db.prepare(`
      SELECT COUNT(DISTINCT user_name) as count FROM user_relationships WHERE chat_id = ?
    `).get(this.chatId) as any;
    stats.totalUsers = usersResult?.count || 0;

    // Количество активных тем
    const topicsResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM chat_topics WHERE chat_id = ? AND status = 'active'
    `).get(this.chatId) as any;
    stats.activeTopics = topicsResult?.count || 0;

    // Размер базы данных
    const dbPath = config.databasePath || './memory.db';
    try {
      stats.databaseSize = require('fs').statSync(dbPath).size;
    } catch {
      stats.databaseSize = 0;
    }

    return stats;
  }


  /**
   * Исправляет счетчики дней в базе данных (пересчитывает по уникальным дням)
   */
  fixInteractionCounts(): void {
    Logger.info('🔧 Исправляем счетчики дней взаимодействия...');
    
    // Получаем всех пользователей этого чата
    const users = this.db.prepare(`
      SELECT DISTINCT user_name FROM user_relationships 
      WHERE chat_id = ?
    `).all(this.chatId) as any[];
    
    for (const user of users) {
      // Считаем количество уникальных дней для этого пользователя
      const uniqueDays = this.db.prepare(`
        SELECT COUNT(DISTINCT DATE(timestamp)) as day_count
        FROM messages 
        WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      `).get(this.chatId, user.user_name) as any;
      
      const correctCount = uniqueDays?.day_count || 1;
      
      // Обновляем счетчик
      this.db.prepare(`
        UPDATE user_relationships 
        SET interaction_count = ?
        WHERE chat_id = ? AND user_name = ?
      `).run(correctCount, this.chatId, user.user_name);
      
      Logger.info(`📅 ${user.user_name}: исправлено на ${correctCount} дней`);
    }
    
    Logger.info('✅ Счетчики дней исправлены');
  }

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    this.db.close();
  }
}