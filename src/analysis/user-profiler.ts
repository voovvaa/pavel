import { Database } from 'bun:sqlite';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';

export interface UserProfile {
  id?: number;
  chatId: string;
  userName: string;
  
  // Основные характеристики
  messageCount: number;
  averageMessageLength: number;
  activityPattern: {
    activeHours: number[];
    activeDays: number[];
    peakActivity: number; // час наибольшей активности
  };
  
  // Стиль общения
  communicationStyle: {
    formalityLevel: number; // 0-1 (0 - неформальный, 1 - формальный)
    emotionalExpression: number; // 0-1 (сколько эмоций выражает)
    responseLatency: number; // среднее время ответа в минутах
    initiationRate: number; // как часто начинает разговор (0-1)
  };
  
  // Языковые особенности
  languageFeatures: {
    vocabularySize: number;
    averageWordLength: number;
    commonWords: string[];
    commonEmojis: string[];
    punctuationStyle: 'minimal' | 'normal' | 'excessive';
    capitalizationStyle: 'lowercase' | 'normal' | 'uppercase';
  };
  
  // Темы и интересы
  interests: {
    topTopics: Array<{ topic: string; frequency: number }>;
    mentionedUsers: Array<{ user: string; count: number }>;
    questionsAsked: number;
    questionsAnswered: number;
  };
  
  // Социальное поведение
  socialBehavior: {
    helpfulness: number; // 0-1 (как часто помогает)
    conflictAvoidance: number; // 0-1 (избегает ли конфликты)
    humor: number; // 0-1 (использует ли юмор)
    supportiveness: number; // 0-1 (поддерживает ли других)
  };
  
  // Временные характеристики
  temporalPattern: {
    firstSeen: Date;
    lastSeen: Date;
    totalDays: number;
    averageMessagesPerDay: number;
    longestBreak: number; // дней без активности
  };
  
  // Метаданные
  lastAnalyzed: Date;
  confidence: number; // 0-1 (уверенность в анализе)
}

export class UserProfiler {
  private db: Database;
  private chatId: string;

  constructor(chatId: string) {
    this.chatId = chatId;
    this.db = new Database(config.databasePath || './memory.db');
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Таблица профилей пользователей
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        average_message_length REAL DEFAULT 0,
        
        -- Паттерн активности (JSON)
        activity_pattern TEXT,
        
        -- Стиль общения (JSON) 
        communication_style TEXT,
        
        -- Языковые особенности (JSON)
        language_features TEXT,
        
        -- Интересы (JSON)
        interests TEXT,
        
        -- Социальное поведение (JSON)
        social_behavior TEXT,
        
        -- Временные характеристики (JSON)
        temporal_pattern TEXT,
        
        last_analyzed DATETIME DEFAULT CURRENT_TIMESTAMP,
        confidence REAL DEFAULT 0.0,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(chat_id, user_name)
      )
    `);

    // Индекс для быстрого поиска
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_profiles_chat ON user_profiles(chat_id, user_name);
    `);

    Logger.info('База данных профилей пользователей инициализирована');
  }

  /**
   * Анализирует профиль конкретного пользователя
   */
  async analyzeUser(userName: string): Promise<UserProfile> {
    Logger.info(`🔍 Анализируем профиль пользователя: ${userName}`);
    
    const profile: UserProfile = {
      chatId: this.chatId,
      userName,
      messageCount: 0,
      averageMessageLength: 0,
      activityPattern: {
        activeHours: [],
        activeDays: [],
        peakActivity: 12
      },
      communicationStyle: {
        formalityLevel: 0.5,
        emotionalExpression: 0.5,
        responseLatency: 30,
        initiationRate: 0.1
      },
      languageFeatures: {
        vocabularySize: 0,
        averageWordLength: 4.5,
        commonWords: [],
        commonEmojis: [],
        punctuationStyle: 'normal',
        capitalizationStyle: 'normal'
      },
      interests: {
        topTopics: [],
        mentionedUsers: [],
        questionsAsked: 0,
        questionsAnswered: 0
      },
      socialBehavior: {
        helpfulness: 0.5,
        conflictAvoidance: 0.5,
        humor: 0.5,
        supportiveness: 0.5
      },
      temporalPattern: {
        firstSeen: new Date(),
        lastSeen: new Date(),
        totalDays: 1,
        averageMessagesPerDay: 0,
        longestBreak: 0
      },
      lastAnalyzed: new Date(),
      confidence: 0.0
    };

    // Получаем базовую статистику
    await this.analyzeBasicStats(userName, profile);
    
    // Анализируем паттерны активности
    await this.analyzeActivityPattern(userName, profile);
    
    // Анализируем стиль общения
    await this.analyzeCommunicationStyle(userName, profile);
    
    // Анализируем языковые особенности
    await this.analyzeLanguageFeatures(userName, profile);
    
    // Анализируем интересы
    await this.analyzeInterests(userName, profile);
    
    // Анализируем социальное поведение
    await this.analyzeSocialBehavior(userName, profile);
    
    // Анализируем временные паттерны
    await this.analyzeTemporalPatterns(userName, profile);
    
    // Сохраняем профиль
    await this.saveProfile(profile);
    
    Logger.info(`✅ Профиль ${userName} проанализирован (уверенность: ${(profile.confidence * 100).toFixed(1)}%)`);
    
    return profile;
  }

  private async analyzeBasicStats(userName: string, profile: UserProfile): Promise<void> {
    // Базовая статистика сообщений
    const basicStats = this.db.prepare(`
      SELECT 
        COUNT(*) as message_count,
        AVG(LENGTH(content)) as avg_length,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
    `).get(this.chatId, userName) as any;

    if (basicStats && basicStats.message_count > 0) {
      profile.messageCount = basicStats.message_count;
      profile.averageMessageLength = Math.round(basicStats.avg_length || 0);
      profile.temporalPattern.firstSeen = new Date(basicStats.first_seen);
      profile.temporalPattern.lastSeen = new Date(basicStats.last_seen);
      
      // Считаем количество уникальных дней
      const uniqueDays = this.db.prepare(`
        SELECT COUNT(DISTINCT DATE(timestamp)) as unique_days
        FROM messages 
        WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      `).get(this.chatId, userName) as any;
      
      profile.temporalPattern.totalDays = uniqueDays?.unique_days || 1;
      profile.temporalPattern.averageMessagesPerDay = profile.messageCount / profile.temporalPattern.totalDays;
      
      // Базовая уверенность зависит от количества сообщений
      profile.confidence = Math.min(profile.messageCount / 100, 1.0);
    }
  }

  private async analyzeActivityPattern(userName: string, profile: UserProfile): Promise<void> {
    // Анализ активности по часам
    const hourlyActivity = this.db.prepare(`
      SELECT 
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      GROUP BY hour
      ORDER BY count DESC
    `).all(this.chatId, userName) as any[];

    if (hourlyActivity.length > 0) {
      profile.activityPattern.activeHours = hourlyActivity
        .filter(h => h.count > profile.messageCount * 0.05) // активные часы (>5% от общей активности)
        .map(h => h.hour);
      
      profile.activityPattern.peakActivity = hourlyActivity[0]?.hour || 12;
    }

    // Анализ активности по дням недели
    const weeklyActivity = this.db.prepare(`
      SELECT 
        CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
        COUNT(*) as count
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      GROUP BY day_of_week
      ORDER BY count DESC
    `).all(this.chatId, userName) as any[];

    if (weeklyActivity.length > 0) {
      profile.activityPattern.activeDays = weeklyActivity
        .filter(d => d.count > profile.messageCount * 0.1) // активные дни (>10% от общей активности)
        .map(d => d.day_of_week);
    }
  }

  private async analyzeCommunicationStyle(userName: string, profile: UserProfile): Promise<void> {
    // Анализ формальности (по наличию знаков препинания, длине предложений)
    const formalityIndicators = this.db.prepare(`
      SELECT 
        AVG(CASE WHEN content LIKE '%.%' OR content LIKE '%!%' OR content LIKE '%?%' THEN 1 ELSE 0 END) as punctuation_rate,
        AVG(CASE WHEN content = UPPER(content) AND LENGTH(content) > 5 THEN 1 ELSE 0 END) as caps_rate,
        AVG(CASE WHEN content LIKE '%пожалуйста%' OR content LIKE '%спасибо%' OR content LIKE '%извините%' THEN 1 ELSE 0 END) as politeness_rate
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
    `).get(this.chatId, userName) as any;

    if (formalityIndicators) {
      profile.communicationStyle.formalityLevel = 
        (formalityIndicators.punctuation_rate * 0.4 + 
         formalityIndicators.politeness_rate * 0.6) || 0.5;
    }

    // Анализ эмоциональности (по эмодзи, восклицательным знакам)
    const emotionalIndicators = this.db.prepare(`
      SELECT 
        AVG(CASE WHEN content LIKE '%😂%' OR content LIKE '%😄%' OR content LIKE '%😊%' THEN 1 ELSE 0 END) as positive_emoji_rate,
        AVG(CASE WHEN content LIKE '%!%' THEN 1 ELSE 0 END) as exclamation_rate,
        AVG(CASE WHEN content LIKE '%?%' THEN 1 ELSE 0 END) as question_rate
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
    `).get(this.chatId, userName) as any;

    if (emotionalIndicators) {
      profile.communicationStyle.emotionalExpression = 
        (emotionalIndicators.positive_emoji_rate * 0.5 + 
         emotionalIndicators.exclamation_rate * 0.3 +
         emotionalIndicators.question_rate * 0.2) || 0.5;
    }

    // Анализ инициативности (начинает ли новые темы)
    const initiationStats = this.db.prepare(`
      SELECT COUNT(*) as initiated_conversations
      FROM messages m1
      WHERE m1.chat_id = ? AND m1.author = ? AND m1.is_from_bot = 0
        AND NOT EXISTS (
          SELECT 1 FROM messages m2 
          WHERE m2.chat_id = m1.chat_id 
            AND m2.timestamp > datetime(m1.timestamp, '-5 minutes')
            AND m2.timestamp < m1.timestamp
            AND m2.author != m1.author
        )
    `).get(this.chatId, userName) as any;

    if (initiationStats && profile.messageCount > 0) {
      profile.communicationStyle.initiationRate = 
        Math.min(initiationStats.initiated_conversations / profile.messageCount, 1.0);
    }
  }

  private async analyzeLanguageFeatures(userName: string, profile: UserProfile): Promise<void> {
    // Анализ словаря
    const vocabularyStats = this.db.prepare(`
      SELECT content
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      LIMIT 100
    `).all(this.chatId, userName) as any[];

    if (vocabularyStats.length > 0) {
      const allWords = vocabularyStats
        .map(row => row.content.toLowerCase()
          .replace(/[^\wа-яё\s]/gi, ' ')
          .split(/\s+/)
          .filter((word: string) => word.length > 2)
        )
        .flat();

      const uniqueWords = new Set(allWords);
      profile.languageFeatures.vocabularySize = uniqueWords.size;
      
      const totalLength = allWords.reduce((sum, word) => sum + word.length, 0);
      profile.languageFeatures.averageWordLength = totalLength / allWords.length || 4.5;

      // Топ слова
      const wordCounts = new Map<string, number>();
      allWords.forEach(word => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      });

      profile.languageFeatures.commonWords = Array.from(wordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);
    }

    // Анализ эмодзи
    const emojiStats = this.db.prepare(`
      SELECT content
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND (content LIKE '%😂%' OR content LIKE '%😄%' OR content LIKE '%😊%' OR content LIKE '%❤️%')
      LIMIT 50
    `).all(this.chatId, userName) as any[];

    const emojiRegex = /[\p{Emoji}]/gu;
    const allEmojis: string[] = [];
    
    emojiStats.forEach(row => {
      const matches = row.content.match(emojiRegex);
      if (matches) allEmojis.push(...matches);
    });

    const emojiCounts = new Map<string, number>();
    allEmojis.forEach(emoji => {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
    });

    profile.languageFeatures.commonEmojis = Array.from(emojiCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emoji]) => emoji);
  }

  private async analyzeInterests(userName: string, profile: UserProfile): Promise<void> {
    // Анализ тем (из активных тем чата)
    const userTopics = this.db.prepare(`
      SELECT ct.topic, COUNT(*) as mentions
      FROM chat_topics ct
      JOIN messages m ON m.chat_id = ct.chat_id 
        AND (m.content LIKE '%' || ct.topic || '%' OR m.topics LIKE '%' || ct.topic || '%')
      WHERE ct.chat_id = ? AND m.author = ? AND m.is_from_bot = 0
      GROUP BY ct.topic
      ORDER BY mentions DESC
      LIMIT 10
    `).all(this.chatId, userName) as any[];

    profile.interests.topTopics = userTopics.map(topic => ({
      topic: topic.topic,
      frequency: topic.mentions / profile.messageCount
    }));

    // Анализ упоминаний других пользователей
    const mentionStats = this.db.prepare(`
      SELECT mentions
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND mentions IS NOT NULL
    `).all(this.chatId, userName) as any[];

    const allMentions: string[] = [];
    mentionStats.forEach(row => {
      try {
        const mentions = JSON.parse(row.mentions);
        allMentions.push(...mentions);
      } catch {}
    });

    const mentionCounts = new Map<string, number>();
    allMentions.forEach(mention => {
      mentionCounts.set(mention, (mentionCounts.get(mention) || 0) + 1);
    });

    profile.interests.mentionedUsers = Array.from(mentionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([user, count]) => ({ user, count }));

    // Анализ вопросов
    const questionStats = this.db.prepare(`
      SELECT 
        COUNT(CASE WHEN content LIKE '%?%' THEN 1 END) as questions_asked,
        COUNT(CASE WHEN content LIKE '%да%' OR content LIKE '%нет%' OR content LIKE '%конечно%' THEN 1 END) as potential_answers
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
    `).get(this.chatId, userName) as any;

    if (questionStats) {
      profile.interests.questionsAsked = questionStats.questions_asked || 0;
      profile.interests.questionsAnswered = questionStats.potential_answers || 0;
    }
  }

  private async analyzeSocialBehavior(userName: string, profile: UserProfile): Promise<void> {
    // Анализ готовности помочь
    const helpfulnessIndicators = this.db.prepare(`
      SELECT COUNT(*) as helpful_messages
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND (content LIKE '%помогу%' OR content LIKE '%расскажу%' OR content LIKE '%объясню%' OR content LIKE '%покажу%')
    `).get(this.chatId, userName) as any;

    profile.socialBehavior.helpfulness = 
      Math.min((helpfulnessIndicators?.helpful_messages || 0) / Math.max(profile.messageCount, 1), 1.0);

    // Анализ поддержки других
    const supportIndicators = this.db.prepare(`
      SELECT COUNT(*) as supportive_messages
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND (content LIKE '%молодец%' OR content LIKE '%круто%' OR content LIKE '%отлично%' OR content LIKE '%супер%')
    `).get(this.chatId, userName) as any;

    profile.socialBehavior.supportiveness = 
      Math.min((supportIndicators?.supportive_messages || 0) / Math.max(profile.messageCount, 1), 1.0);

    // Анализ юмора
    const humorIndicators = this.db.prepare(`
      SELECT COUNT(*) as humorous_messages
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND (content LIKE '%😂%' OR content LIKE '%ахах%' OR content LIKE '%лол%' OR content LIKE '%ржу%')
    `).get(this.chatId, userName) as any;

    profile.socialBehavior.humor = 
      Math.min((humorIndicators?.humorous_messages || 0) / Math.max(profile.messageCount, 1), 1.0);

    // Анализ избегания конфликтов (низкое использование негативных слов)
    const conflictIndicators = this.db.prepare(`
      SELECT COUNT(*) as negative_messages
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
        AND (content LIKE '%блядь%' OR content LIKE '%пиздец%' OR content LIKE '%дурак%' OR content LIKE '%идиот%')
    `).get(this.chatId, userName) as any;

    profile.socialBehavior.conflictAvoidance = 
      1.0 - Math.min((conflictIndicators?.negative_messages || 0) / Math.max(profile.messageCount, 1), 1.0);
  }

  private async analyzeTemporalPatterns(userName: string, profile: UserProfile): Promise<void> {
    // Анализ перерывов в активности
    const dailyActivity = this.db.prepare(`
      SELECT DATE(timestamp) as date
      FROM messages 
      WHERE chat_id = ? AND author = ? AND is_from_bot = 0
      GROUP BY DATE(timestamp)
      ORDER BY date
    `).all(this.chatId, userName) as any[];

    if (dailyActivity.length > 1) {
      let maxBreak = 0;
      for (let i = 1; i < dailyActivity.length; i++) {
        const prevDate = new Date(dailyActivity[i-1].date);
        const currDate = new Date(dailyActivity[i].date);
        const breakDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        maxBreak = Math.max(maxBreak, breakDays);
      }
      profile.temporalPattern.longestBreak = maxBreak;
    }
  }

  /**
   * Сохраняет профиль в базу данных
   */
  private async saveProfile(profile: UserProfile): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_profiles (
        chat_id, user_name, message_count, average_message_length,
        activity_pattern, communication_style, language_features,
        interests, social_behavior, temporal_pattern,
        last_analyzed, confidence, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      profile.chatId,
      profile.userName,
      profile.messageCount,
      profile.averageMessageLength,
      JSON.stringify(profile.activityPattern),
      JSON.stringify(profile.communicationStyle),
      JSON.stringify(profile.languageFeatures),
      JSON.stringify(profile.interests),
      JSON.stringify(profile.socialBehavior),
      JSON.stringify(profile.temporalPattern),
      profile.lastAnalyzed.toISOString(),
      profile.confidence
    );
  }

  /**
   * Получает сохраненный профиль пользователя
   */
  async getProfile(userName: string): Promise<UserProfile | null> {
    const row = this.db.prepare(`
      SELECT * FROM user_profiles 
      WHERE chat_id = ? AND user_name = ?
    `).get(this.chatId, userName) as any;

    if (!row) return null;

    try {
      return {
        id: row.id,
        chatId: row.chat_id,
        userName: row.user_name,
        messageCount: row.message_count,
        averageMessageLength: row.average_message_length,
        activityPattern: JSON.parse(row.activity_pattern),
        communicationStyle: JSON.parse(row.communication_style),
        languageFeatures: JSON.parse(row.language_features),
        interests: JSON.parse(row.interests),
        socialBehavior: JSON.parse(row.social_behavior),
        temporalPattern: JSON.parse(row.temporal_pattern),
        lastAnalyzed: new Date(row.last_analyzed),
        confidence: row.confidence
      };
    } catch (error) {
      Logger.error(`Ошибка парсинга профиля ${userName}: ${error}`);
      return null;
    }
  }

  /**
   * Анализирует всех пользователей чата
   */
  async analyzeAllUsers(): Promise<UserProfile[]> {
    Logger.info('🔍 Анализируем всех пользователей чата...');

    const users = this.db.prepare(`
      SELECT DISTINCT author 
      FROM messages 
      WHERE chat_id = ? AND is_from_bot = 0
        AND author != ''
      ORDER BY author
    `).all(this.chatId) as any[];

    const profiles: UserProfile[] = [];

    for (const user of users) {
      try {
        const profile = await this.analyzeUser(user.author);
        profiles.push(profile);
      } catch (error) {
        Logger.error(`Ошибка анализа пользователя ${user.author}: ${error}`);
      }
    }

    Logger.info(`✅ Проанализировано ${profiles.length} профилей пользователей`);
    return profiles;
  }

  /**
   * Получает краткое описание профиля для AI
   */
  getProfileSummary(profile: UserProfile): string {
    const activity = profile.activityPattern.peakActivity;
    const style = profile.communicationStyle;
    const social = profile.socialBehavior;
    
    let summary = `${profile.userName} (${profile.messageCount} сообщений):\n`;
    
    // Стиль общения
    if (style.formalityLevel > 0.7) summary += '- Формальный стиль общения\n';
    else if (style.formalityLevel < 0.3) summary += '- Неформальный стиль общения\n';
    
    if (style.emotionalExpression > 0.6) summary += '- Эмоционально активен\n';
    if (style.initiationRate > 0.3) summary += '- Часто инициирует разговоры\n';
    
    // Социальное поведение
    if (social.humor > 0.4) summary += '- Использует юмор\n';
    if (social.helpfulness > 0.3) summary += '- Готов помочь\n';
    if (social.supportiveness > 0.3) summary += '- Поддерживает других\n';
    
    // Интересы
    if (profile.interests.topTopics.length > 0) {
      summary += `- Интересы: ${profile.interests.topTopics.slice(0, 3).map(t => t.topic).join(', ')}\n`;
    }
    
    // Временные паттерны
    summary += `- Активность: пик в ${activity}:00, общается ${profile.temporalPattern.totalDays} дней\n`;
    
    return summary.trim();
  }

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    this.db.close();
  }
}