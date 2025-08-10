import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { cacheManager, SmartCache } from '../core/cache-manager.js';
import { 
  MemoryEntry, 
  ConversationSummary, 
  UserRelationship, 
  ChatTopic, 
  MemoryContext 
} from '../core/types.js';
// ЭТАП 8: Эмоциональный анализ
import { EmotionAnalyzer, EmotionalProfile, GroupEmotionalState } from '../ai/emotion-analyzer.js';
// ЭТАП 9: Трекер событий
import { EventTracker } from '../core/event-tracker.js';

export class MemoryManager {
  private db: Database;
  private chatId: string;
  // ЭТАП 8: Эмоциональный анализатор
  private emotionAnalyzer: EmotionAnalyzer;
  private emotionalProfiles: Map<string, EmotionalProfile>;
  private lastGroupAnalysis: Date | null = null;
  // ЭТАП 9: Трекер событий
  private eventTracker: EventTracker;
  // Кэширование
  private memoryCache: SmartCache<MemoryEntry[]>;
  private userCache: SmartCache<UserRelationship>;
  private topicsCache: SmartCache<ChatTopic[]>;
  private profilesCache: SmartCache<EmotionalProfile>;

  constructor(chatId: string) {
    this.chatId = chatId;
    this.db = new Database(config.databasePath || './memory.db');
    this.emotionAnalyzer = new EmotionAnalyzer();
    this.emotionalProfiles = new Map();
    this.eventTracker = new EventTracker(chatId);
    
    // Инициализируем кэши
    this.memoryCache = cacheManager.getCache<MemoryEntry[]>('memory');
    this.userCache = cacheManager.getCache<UserRelationship>('profiles');
    this.topicsCache = cacheManager.getCache<ChatTopic[]>('topics');
    this.profilesCache = cacheManager.getCache<EmotionalProfile>('profiles');
    
    this.initializeDatabase();
    
    // Исправляем счетчики дней при первом запуске
    try {
      this.fixInteractionCounts();
    } catch (error) {
      Logger.warn('Не удалось исправить счетчики дней:', error);
    }

    // ЭТАП 8: Загружаем эмоциональные профили
    this.loadEmotionalProfiles();
    
    Logger.info('💾 Менеджер памяти с кэшированием активирован');
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

    // ЭТАП 8: Таблица для эмоциональных профилей пользователей
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emotional_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        temperament TEXT,
        expressiveness REAL DEFAULT 0.5,
        stability REAL DEFAULT 0.5,
        typical_emotions TEXT, -- JSON array
        social_role TEXT,
        profile_data TEXT, -- JSON данные полного профиля
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_name)
      )
    `);

    // ЭТАП 8: Таблица для группового эмоционального состояния
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS group_emotional_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        dominant_mood TEXT,
        mood_intensity REAL DEFAULT 0.5,
        harmony REAL DEFAULT 0.5,
        tension REAL DEFAULT 0.0,
        energy REAL DEFAULT 0.5,
        engagement REAL DEFAULT 0.5,
        conflicts TEXT, -- JSON данные конфликтов
        emotional_topics TEXT, -- JSON данные эмоциональных тем
        analysis_timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для производительности
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(chat_id, author);
      CREATE INDEX IF NOT EXISTS idx_topics_chat ON chat_topics(chat_id, status);
      CREATE INDEX IF NOT EXISTS idx_relationships_chat ON user_relationships(chat_id);
      CREATE INDEX IF NOT EXISTS idx_emotional_profiles_chat ON emotional_profiles(chat_id);
      CREATE INDEX IF NOT EXISTS idx_group_emotions_chat ON group_emotional_states(chat_id, analysis_timestamp);
    `);

    Logger.info('База данных памяти инициализирована (включая эмоциональные таблицы)');
  }

  /**
   * Сохраняет сообщение в память с эмоциональным анализом (ЭТАП 8) и инвалидацией кэша
   */
  saveMessage(entry: Omit<MemoryEntry, 'id'>): number {
    // Инвалидируем связанные кэши
    this.memoryCache.delete(`recent_${this.chatId}_20`);
    this.memoryCache.delete(`recent_${this.chatId}_10`);
    this.memoryCache.delete(`recent_${this.chatId}_5`);
    
    // ЭТАП 8: Проводим эмоциональный анализ сообщения
    let emotionAnalysis = entry.emotionAnalysis;
    if (!emotionAnalysis && !entry.isFromBot && entry.content.length > 5) {
      const userProfile = this.emotionalProfiles.get(entry.author);
      const recentMessages = this.getRecentMessages(5);
      
      emotionAnalysis = this.emotionAnalyzer.analyzeMessageEmotion(
        entry.content, 
        entry.author, 
        { recentMessages, userProfile }
      );
      
      Logger.debug(`🎭 Эмоциональный анализ для "${entry.content.substring(0, 30)}...": ${emotionAnalysis.dominant} (${(emotionAnalysis.intensity * 100).toFixed(0)}%)`);
    }

    // Сначала сохраняем сообщение
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
      emotionAnalysis?.dominant || entry.emotion || 'neutral',
      entry.topics ? JSON.stringify(entry.topics) : null,
      entry.mentions ? JSON.stringify(entry.mentions) : null
    );

    const messageId = (result as any).lastInsertRowid || this.db.lastInsertRowid || 1;

    // ЭТАП 8: Обновляем эмоциональный профиль пользователя
    if (!entry.isFromBot && emotionAnalysis) {
      this.updateEmotionalProfile(entry.author, emotionAnalysis);
    }

    // ЭТАП 9: Анализируем сообщение на предмет важных событий
    if (!entry.isFromBot && entry.content.length > 20) {
      try {
        const recentMessages = this.getRecentMessages(5);
        const messageEntry = { ...entry, id: messageId, emotionAnalysis };
        const event = this.eventTracker.analyzeMessage(messageEntry, recentMessages.slice(0, -1));
        
        if (event) {
          const eventId = this.eventTracker.saveEvent(event);
          Logger.debug(`📅 Обнаружено и сохранено событие: ${event.title} (ID: ${eventId})`);
        }
      } catch (error) {
        Logger.warn('Ошибка анализа событий:', error);
      }
    }

    return messageId;
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

  // ЭТАП 8: Методы для работы с эмоциональным анализом

  /**
   * Загружает эмоциональные профили из базы данных
   */
  private loadEmotionalProfiles(): void {
    const stmt = this.db.prepare(`
      SELECT user_name, profile_data FROM emotional_profiles 
      WHERE chat_id = ?
    `);

    const rows = stmt.all(this.chatId) as any[];
    
    for (const row of rows) {
      try {
        const profile: EmotionalProfile = JSON.parse(row.profile_data);
        this.emotionalProfiles.set(row.user_name, profile);
        Logger.debug(`📊 Загружен эмоциональный профиль для ${row.user_name}: ${profile.temperament}, роль: ${profile.socialRole}`);
      } catch (error) {
        Logger.warn(`Ошибка при загрузке профиля ${row.user_name}:`, error);
      }
    }

    Logger.info(`🎭 Загружено ${this.emotionalProfiles.size} эмоциональных профилей`);
  }

  /**
   * Обновляет эмоциональный профиль пользователя
   */
  private updateEmotionalProfile(userName: string, newEmotionAnalysis: any): void {
    // Получаем историю сообщений пользователя для построения профиля
    const userMessages = this.getUserMessages(userName, 100);
    
    if (userMessages.length < 5) {
      Logger.debug(`🎭 Недостаточно данных для профиля ${userName} (${userMessages.length} сообщений)`);
      return; // Недостаточно данных для анализа
    }

    const relationship = this.getUserRelationship(userName);
    const profile = this.emotionAnalyzer.buildEmotionalProfile(userName, userMessages, relationship || undefined);
    
    // Сохраняем профиль в БД
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO emotional_profiles (
        chat_id, user_name, temperament, expressiveness, 
        stability, typical_emotions, social_role, profile_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      this.chatId,
      userName,
      profile.temperament,
      profile.expressiveness,
      profile.stability,
      JSON.stringify(profile.typicalEmotions),
      profile.socialRole,
      JSON.stringify(profile)
    );

    // Обновляем в памяти
    this.emotionalProfiles.set(userName, profile);
    
    Logger.info(`🎭 Обновлен профиль ${userName}: ${profile.temperament} (${(profile.expressiveness * 100).toFixed(0)}% эмоциональность)`);
  }

  /**
   * Получает сообщения конкретного пользователя
   */
  private getUserMessages(userName: string, limit: number = 50): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(this.chatId, userName, limit) as any[];
    return rows.map(this.rowToMemoryEntry).reverse(); // Возвращаем в хронологическом порядке
  }

  /**
   * Анализирует групповое эмоциональное состояние
   */
  async analyzeGroupEmotions(): Promise<GroupEmotionalState | null> {
    const now = new Date();
    
    // Не анализируем чаще чем раз в 10 минут
    if (this.lastGroupAnalysis && (now.getTime() - this.lastGroupAnalysis.getTime()) < 10 * 60 * 1000) {
      return this.getLastGroupEmotionalState();
    }

    const recentMessages = this.getRecentMessages(50);
    if (recentMessages.length < 5) {
      Logger.debug('🎭 Недостаточно сообщений для группового анализа');
      return null;
    }

    const groupState = this.emotionAnalyzer.analyzeGroupEmotions(recentMessages, this.emotionalProfiles);
    
    // Сохраняем результат в БД
    const stmt = this.db.prepare(`
      INSERT INTO group_emotional_states (
        chat_id, dominant_mood, mood_intensity, harmony, tension,
        energy, engagement, conflicts, emotional_topics, analysis_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      this.chatId,
      groupState.groupMood.dominant,
      groupState.groupMood.intensity,
      groupState.dynamics.harmony,
      groupState.dynamics.tension,
      groupState.dynamics.energy,
      groupState.dynamics.engagement,
      JSON.stringify(groupState.conflicts),
      JSON.stringify(groupState.emotionalTopics),
      now.toISOString()
    );

    this.lastGroupAnalysis = now;
    return groupState;
  }

  /**
   * Получает последнее групповое эмоциональное состояние
   */
  private getLastGroupEmotionalState(): GroupEmotionalState | null {
    const stmt = this.db.prepare(`
      SELECT * FROM group_emotional_states 
      WHERE chat_id = ? 
      ORDER BY analysis_timestamp DESC 
      LIMIT 1
    `);

    const row = stmt.get(this.chatId) as any;
    if (!row) return null;

    try {
      return {
        groupMood: {
          dominant: row.dominant_mood,
          intensity: row.mood_intensity,
          stability: 0.5 // Можно рассчитывать на основе истории
        },
        dynamics: {
          harmony: row.harmony,
          tension: row.tension,
          energy: row.energy,
          engagement: row.engagement
        },
        emotionalTopics: JSON.parse(row.emotional_topics || '[]'),
        conflicts: JSON.parse(row.conflicts || '[]')
      };
    } catch (error) {
      Logger.warn('Ошибка при разборе группового состояния:', error);
      return null;
    }
  }

  /**
   * Получает эмоциональный профиль пользователя
   */
  getEmotionalProfile(userName: string): EmotionalProfile | undefined {
    return this.emotionalProfiles.get(userName);
  }

  /**
   * Получает все эмоциональные профили
   */
  getAllEmotionalProfiles(): Map<string, EmotionalProfile> {
    return new Map(this.emotionalProfiles);
  }

  /**
   * Оптимизированное построение контекста памяти с меньшим количеством SQL запросов
   */
  async buildMemoryContext(currentMessage: string, author: string): Promise<MemoryContext> {
    // Объединенный запрос для получения недавних сообщений и релевантной истории
    const keywords = this.extractKeywords(currentMessage);
    
    // Один запрос для всех данных сообщений
    const allMessagesStmt = this.db.prepare(`
      SELECT *, 
        CASE 
          WHEN timestamp > datetime('now', '-1 hour') THEN 'recent'
          WHEN (${keywords.map(() => 'lower(content) LIKE ?').join(' OR ')}) THEN 'relevant'
          ELSE 'other'
        END as message_category
      FROM messages 
      WHERE chat_id = ? 
        AND timestamp > datetime('now', '-${config.memoryDays || 30} days')
      ORDER BY timestamp DESC
      LIMIT 50
    `);

    const params = [this.chatId, ...keywords.map(k => `%${k.toLowerCase()}%`)];
    const allMessages = allMessagesStmt.all(...params) as any[];
    
    // Разделяем сообщения по категориям
    const recentMessages = allMessages
      .filter(row => row.message_category === 'recent')
      .slice(0, 5)
      .map(this.rowToMemoryEntry)
      .reverse();
      
    const relevantHistory = allMessages
      .filter(row => row.message_category === 'relevant')
      .slice(0, 1)
      .map(this.rowToMemoryEntry);

    // Получаем отношения и активные темы одним запросом каждый
    const relationship = this.getUserRelationship(author);
    const userRelationships = new Map<string, UserRelationship>();
    if (relationship) {
      relationship.emotionalProfile = this.getEmotionalProfile(author);
      userRelationships.set(author, relationship);
    }
    
    const activeTopics = this.getActiveTopics(5); // Ограничиваем количество тем
    const conversationSummaries = this.getRecentSummaries(3); // Меньше сводок
    const currentMood = this.analyzeCurrentMood(recentMessages);
    
    // Групповые эмоции и события получаем асинхронно но не блокируем основной поток
    const groupEmotionalState = await this.analyzeGroupEmotions();
    const relevantEvents = keywords.length > 0 ? this.eventTracker.getRelevantEvents(keywords, 2) : [];

    return {
      recentMessages,
      relevantHistory,
      conversationSummaries,
      userRelationships,
      activeTopics,
      currentMood,
      groupEmotionalState: groupEmotionalState || undefined,
      relevantEvents: relevantEvents.length > 0 ? relevantEvents : undefined
    };
  }

  /**
   * Получает статистику эмоций для аналитики
   */
  getEmotionalStats(): any {
    const stats: any = {};
    
    // Статистика по профилям
    stats.profilesCount = this.emotionalProfiles.size;
    
    const temperamentCounts: { [key: string]: number } = {};
    const roleCounts: { [key: string]: number } = {};
    
    for (const profile of this.emotionalProfiles.values()) {
      temperamentCounts[profile.temperament] = (temperamentCounts[profile.temperament] || 0) + 1;
      roleCounts[profile.socialRole] = (roleCounts[profile.socialRole] || 0) + 1;
    }
    
    stats.temperamentDistribution = temperamentCounts;
    stats.socialRoleDistribution = roleCounts;
    
    // Групповая статистика
    const groupState = this.getLastGroupEmotionalState();
    if (groupState) {
      stats.groupMood = groupState.groupMood.dominant;
      stats.harmony = groupState.dynamics.harmony;
      stats.tension = groupState.dynamics.tension;
      stats.conflictsCount = groupState.conflicts.length;
    }
    
    return stats;
  }

  /**
   * Получает памятные события для естественного упоминания (ЭТАП 9)
   */
  getMemorableEvents(limit = 3): import('../core/event-tracker.js').ChatEvent[] {
    return this.eventTracker.getMemorableEvents(limit);
  }

  /**
   * Получает статистику событий для аналитики (ЭТАП 9)
   */
  getEventStats(): any {
    return this.eventTracker.getEventStats();
  }

  /**
   * Получает события за определенный период (ЭТАП 9)
   */
  getEventsByPeriod(days = 7): import('../core/event-tracker.js').ChatEvent[] {
    return this.eventTracker.getEventsByPeriod(days);
  }

  /**
   * Очистка старой памяти с учетом событий (ЭТАП 9)
   */
  cleanupOldMemoryWithEvents(): void {
    // Сначала обычная очистка
    this.cleanupOldMemory();
    
    // Затем архивируем старые события низкой важности
    const archivedCount = this.eventTracker.archiveOldEvents(90);
    
    if (archivedCount > 0) {
      Logger.info(`🗄️ Архивировано ${archivedCount} старых событий при очистке памяти`);
    }
  }

  /**
   * Получает полную статистику памяти с событиями (ЭТАП 9)  
   */
  getExtendedMemoryStats(): any {
    const baseStats = this.getMemoryStats();
    const eventStats = this.getEventStats();
    const emotionalStats = this.getEmotionalStats();
    
    return {
      ...baseStats,
      events: eventStats,
      emotions: emotionalStats,
      totalMemoryEntries: baseStats.totalMessages + eventStats.totalEvents
    };
  }

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    if (this.eventTracker) {
      this.eventTracker.close();
    }
    this.db.close();
  }

  // Методы для работы с кэшированием

  /**
   * Получает статистику всех кэшей
   */
  getCacheStats(): any {
    return {
      memory: this.memoryCache.getStats(),
      users: this.userCache.getStats(),
      topics: this.topicsCache.getStats(),
      profiles: this.profilesCache.getStats()
    };
  }

  /**
   * Очищает все кэши
   */
  clearAllCaches(): void {
    this.memoryCache.clear();
    this.userCache.clear();
    this.topicsCache.clear();
    this.profilesCache.clear();
    Logger.info('🧹 Все кэши памяти очищены');
  }

  /**
   * Принудительная очистка просроченных записей в кэшах
   */
  cleanupCaches(): void {
    this.memoryCache.cleanup();
    this.userCache.cleanup();
    this.topicsCache.cleanup();
    this.profilesCache.cleanup();
    Logger.debug('🧹 Очистка просроченных кэшей завершена');
  }

  /**
   * Прогрев кэшей популярными данными
   */
  async warmupCaches(): Promise<void> {
    Logger.info('🔥 Прогрев кэшей памяти...');
    
    try {
      // Прогреваем недавние сообщения
      this.getRecentMessages(20);
      this.getRecentMessages(10);
      this.getRecentMessages(5);
      
      // Прогреваем активные темы
      this.getActiveTopics(20);
      this.getActiveTopics(10);
      this.getActiveTopics(5);
      
      // Прогреваем профили активных пользователей
      const activeUsers = this.db.prepare(`
        SELECT DISTINCT user_name FROM user_relationships 
        WHERE chat_id = ? AND last_interaction > datetime('now', '-7 days')
        LIMIT 10
      `).all(this.chatId) as any[];
      
      for (const user of activeUsers) {
        this.getUserRelationship(user.user_name);
      }
      
      Logger.info(`✨ Кэши прогреты (${activeUsers.length} пользователей)`);
    } catch (error) {
      Logger.warn('Ошибка прогрева кэшей:', error);
    }
  }

  /**
   * Инвалидирует кэши связанные с конкретным пользователем
   */
  invalidateUserCaches(userName: string): void {
    this.userCache.delete(`user_${this.chatId}_${userName}`);
    this.profilesCache.delete(`user_${this.chatId}_${userName}`);
    // Инвалидируем топики так как пользователь мог повлиять на их важность
    this.topicsCache.clear();
    Logger.debug(`🗑️ Кэши пользователя ${userName} инвалидированы`);
  }

  /**
   * Получает детальную информацию о производительности кэшей
   */
  getCachePerformanceReport(): any {
    const stats = this.getCacheStats();
    const globalStats = cacheManager.getAllStats();
    const memoryUsage = cacheManager.getMemoryUsage();
    
    return {
      localCaches: stats,
      globalCaches: globalStats,
      totalMemoryUsage: memoryUsage,
      recommendations: this.generateCacheRecommendations(stats)
    };
  }

  /**
   * Генерирует рекомендации по оптимизации кэшей
   */
  private generateCacheRecommendations(stats: any): string[] {
    const recommendations: string[] = [];
    
    // Анализируем hit rate
    Object.entries(stats).forEach(([cacheName, cacheStats]: [string, any]) => {
      if (cacheStats.hitRate < 0.5) {
        recommendations.push(`📉 Низкий hit rate для кэша ${cacheName} (${(cacheStats.hitRate * 100).toFixed(1)}%)`);
      }
      
      if (cacheStats.totalEntries > 800) {
        recommendations.push(`📊 Кэш ${cacheName} близок к переполнению (${cacheStats.totalEntries} записей)`);
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Все кэши работают оптимально');
    }
    
    return recommendations;
  }
}