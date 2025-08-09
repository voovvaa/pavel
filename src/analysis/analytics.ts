import { TelegramExport, TelegramExportMessage, UserStats, ChatAnalytics } from '../core/types.js';
import { TelegramParser } from './parser.js';
import { Logger } from '../utils/logger.js';

export class ChatAnalyzer {
  private export: TelegramExport;
  private validMessages: TelegramExportMessage[];

  constructor(exportData: TelegramExport) {
    this.export = exportData;
    this.validMessages = TelegramParser.filterValidMessages(exportData.messages);
    Logger.info(`Валидных сообщений для анализа: ${this.validMessages.length}`);
  }

  /**
   * Полный анализ чата с улучшенной фильтрацией
   */
  analyze(): ChatAnalytics {
    Logger.info('Начинаем улучшенный анализ чата...');
    
    // Показываем статистику фильтрации
    const filterStats = TelegramParser.getFilteringStats(this.export.messages);
    this.logFilteringStats(filterStats);
    
    const users = this.analyzeUsers();
    const dateRange = this.getDateRange();
    const wordStats = this.analyzeWords();
    const emojiStats = this.analyzeEmojis();
    const timeStats = this.analyzeTimeActivity();
    const dayStats = this.analyzeDayActivity();
    const messageTypes = this.analyzeMessageTypes();
    const mediaStats = this.analyzeMediaStats();

    const analytics: ChatAnalytics = {
      totalMessages: this.validMessages.length,
      totalUsers: users.length,
      dateRange,
      messagesPerDay: Math.round(this.validMessages.length / dateRange.days),
      topUsers: users.slice(0, 10),
      popularWords: wordStats.slice(0, 50),
      popularEmojis: emojiStats.slice(0, 20),
      messageTypes,
      timeActivity: timeStats,
      dayActivity: dayStats,
      averageMessageLength: this.calculateAverageMessageLength(),
      mediaStats,
      // Новые поля
      commonPatterns: [],
      conversationFlows: []
    };

    Logger.info('Улучшенный анализ чата завершен');
    return analytics;
  }

  /**
   * Анализ пользователей с использованием чистого текста
   */
  private analyzeUsers(): UserStats[] {
    const userMap = new Map<string, {
      messages: TelegramExportMessage[];
      name: string;
    }>();

    // Группируем сообщения по пользователям
    for (const message of this.validMessages) {
      const userName = TelegramParser.normalizeUserName(message);
      if (!userMap.has(userName)) {
        userMap.set(userName, {
          messages: [],
          name: userName
        });
      }
      userMap.get(userName)!.messages.push(message);
    }

    // Анализируем каждого пользователя
    const userStats: UserStats[] = [];
    for (const [userId, userData] of userMap) {
      const stats = this.analyzeUser(userId, userData.name, userData.messages);
      userStats.push(stats);
    }

    // Сортируем по количеству сообщений
    return userStats.sort((a, b) => b.messageCount - a.messageCount);
  }

  /**
   * Анализ конкретного пользователя с чистым текстом
   */
  private analyzeUser(id: string, name: string, messages: TelegramExportMessage[]): UserStats {
    // Используем чистый текст без тегов пользователей
    const texts = messages.map(m => TelegramParser.extractCleanText(m)).filter(t => t);
    const allText = texts.join(' ');
    const characterCount = allText.length;
    
    const dates = messages.map(m => new Date(m.date));
    const firstMessage = new Date(Math.min(...dates.map(d => d.getTime())));
    const lastMessage = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Уникальные дни активности
    const uniqueDays = new Set(dates.map(d => d.toDateString())).size;
    const daysBetween = Math.max(1, Math.ceil((lastMessage.getTime() - firstMessage.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Анализ активности по времени
    const timeActivity: { [hour: string]: number } = {};
    const dayActivity: { [day: string]: number } = {};
    
    for (let i = 0; i < 24; i++) timeActivity[i] = 0;
    for (let i = 0; i < 7; i++) dayActivity[i] = 0;
    
    for (const date of dates) {
      timeActivity[date.getHours()]++;
      dayActivity[date.getDay()]++;
    }

    return {
      id,
      name,
      messageCount: messages.length,
      characterCount,
      averageMessageLength: Math.round(characterCount / Math.max(1, texts.length)),
      firstMessage,
      lastMessage,
      activeDays: uniqueDays,
      messagesPerDay: Math.round(messages.length / daysBetween),
      popularWords: this.getTopWords(allText, 10),
      popularEmojis: this.getTopEmojis(allText, 10),
      timeActivity,
      dayActivity
    };
  }

  /**
   * Анализ популярных слов с исключением тегов
   */
  private analyzeWords(): Array<{ word: string; count: number }> {
    const wordCount = new Map<string, number>();
    
    for (const message of this.validMessages) {
      const cleanText = TelegramParser.extractCleanText(message);
      const words = TelegramParser.extractWords(cleanText);
      
      for (const word of words) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    return Array.from(wordCount.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Анализ популярных эмодзи
   */
  private analyzeEmojis(): Array<{ emoji: string; count: number }> {
    const emojiCount = new Map<string, number>();
    
    for (const message of this.validMessages) {
      const text = TelegramParser.extractText(message); // Оригинальный текст для эмодзи
      const emojis = TelegramParser.extractEmojis(text);
      
      for (const emoji of emojis) {
        emojiCount.set(emoji, (emojiCount.get(emoji) || 0) + 1);
      }
    }

    return Array.from(emojiCount.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Получить топ слов из текста
   */
  private getTopWords(text: string, limit: number): Array<{ word: string; count: number }> {
    const wordCount = new Map<string, number>();
    const words = TelegramParser.extractWords(text);
    
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    return Array.from(wordCount.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Получить топ эмодзи из текста
   */
  private getTopEmojis(text: string, limit: number): Array<{ emoji: string; count: number }> {
    const emojiCount = new Map<string, number>();
    const emojis = TelegramParser.extractEmojis(text);
    
    for (const emoji of emojis) {
      emojiCount.set(emoji, (emojiCount.get(emoji) || 0) + 1);
    }

    return Array.from(emojiCount.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Анализ активности по времени суток
   */
  private analyzeTimeActivity(): { [hour: string]: number } {
    const timeActivity: { [hour: string]: number } = {};
    for (let i = 0; i < 24; i++) timeActivity[i] = 0;
    
    for (const message of this.validMessages) {
      const date = new Date(message.date);
      timeActivity[date.getHours()]++;
    }
    
    return timeActivity;
  }

  /**
   * Анализ активности по дням недели
   */
  private analyzeDayActivity(): { [day: string]: number } {
    const dayActivity: { [day: string]: number } = {};
    for (let i = 0; i < 7; i++) dayActivity[i] = 0;
    
    for (const message of this.validMessages) {
      const date = new Date(message.date);
      dayActivity[date.getDay()]++;
    }
    
    return dayActivity;
  }

  /**
   * Получить диапазон дат
   */
  private getDateRange(): { start: Date; end: Date; days: number } {
    const dates = this.validMessages.map(m => new Date(m.date));
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    
    return { start, end, days };
  }

  /**
   * Анализ типов сообщений
   */
  private analyzeMessageTypes(): { [type: string]: number } {
    const types: { [type: string]: number } = {};
    
    for (const message of this.validMessages) {
      const hasText = Boolean(TelegramParser.extractCleanText(message));
      const hasMedia = Boolean(message.media_type);
      
      if (hasText && !hasMedia) {
        types['text'] = (types['text'] || 0) + 1;
      } else if (hasMedia) {
        const mediaType = message.media_type || 'unknown';
        types[mediaType] = (types[mediaType] || 0) + 1;
      } else {
        types['other'] = (types['other'] || 0) + 1;
      }
    }
    
    return types;
  }

  /**
   * Статистика медиа файлов
   */
  private analyzeMediaStats() {
    const stats = {
      photos: 0,
      videos: 0,
      documents: 0,
      stickers: 0,
      voice: 0,
      audio: 0
    };

    for (const message of this.validMessages) {
      // Проверяем разные способы определения медиа в экспорте Telegram
      
      // Фотографии - поле photo
      if (message.photo) {
        stats.photos++;
        continue;
      }
      
      // Стикеры - поле sticker_emoji или файл в папке stickers
      if (message.sticker_emoji || (message.file && message.file.includes('stickers/'))) {
        stats.stickers++;
        continue;
      }
      
      // Голосовые сообщения - файлы в voice_messages
      if (message.file && message.file.includes('voice_messages/')) {
        stats.voice++;
        continue;
      }
      
      // Проверяем по media_type (для мок-данных)
      if (message.media_type) {
        switch (message.media_type) {
          case 'photo':
            stats.photos++;
            break;
          case 'video_file':
            stats.videos++;
            break;
          case 'document':
            stats.documents++;
            break;
          case 'sticker':
            stats.stickers++;
            break;
          case 'voice_message':
            stats.voice++;
            break;
          case 'audio_file':
            stats.audio++;
            break;
        }
        continue;
      }
      
      // Проверяем по файлу и его расширению/пути
      if (message.file) {
        const file = message.file.toLowerCase();
        
        if (file.includes('video_files/') || file.includes('round_video_messages/') || 
            file.endsWith('.mp4') || file.endsWith('.mov') || file.endsWith('.avi')) {
          stats.videos++;
        } else if (file.endsWith('.pdf') || file.endsWith('.doc') || file.endsWith('.txt') || 
                   file.includes('files/')) {
          stats.documents++;
        } else if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')) {
          stats.audio++;
        }
      }
    }

    return stats;
  }

  /**
   * Средняя длина сообщения
   */
  private calculateAverageMessageLength(): number {
    const textMessages = this.validMessages
      .map(m => TelegramParser.extractCleanText(m))
      .filter(t => t);
    
    if (textMessages.length === 0) return 0;
    
    const totalLength = textMessages.reduce((sum, text) => sum + text.length, 0);
    return Math.round(totalLength / textMessages.length);
  }

  /**
   * Логирует статистику фильтрации
   */
  private logFilteringStats(stats: any): void {
    Logger.info('📊 Статистика фильтрации сообщений:');
    Logger.info(`├─ Всего сообщений: ${stats.total}`);
    Logger.info(`├─ Валидных: ${stats.valid}`);
    Logger.info(`├─ Пересланных (исключено): ${stats.forwarded}`);
    Logger.info(`├─ Ответов на пересылки (включено): ${stats.repliesToForwarded}`);
    Logger.info(`├─ С тегами пользователей: ${stats.withUserTags}`);
    Logger.info(`├─ Для анализа: ${stats.finalForAnalysis}`);
    Logger.info(`└─ Для паттернов: ${stats.finalForPatterns}`);
  }
}