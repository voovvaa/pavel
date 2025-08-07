import { ChatAnalytics, UserStats } from './types.js';
import { Logger } from './logger.js';
import { TelegramParser } from './parser.js';
import { TelegramExport } from './types.js';

export class ConsoleVisualizer {
  static displayAnalytics(analytics: ChatAnalytics, exportData?: TelegramExport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 УЛУЧШЕННЫЙ АНАЛИЗ ЧАТА');
    console.log('='.repeat(60));
    
    // Показываем статистику фильтрации если есть исходные данные
    if (exportData) {
      this.displayFilteringStats(exportData);
    }
    
    this.displayOverview(analytics);
    this.displayTopUsers(analytics.topUsers);
    this.displayPopularWords(analytics.popularWords);
    this.displayPopularEmojis(analytics.popularEmojis);
    this.displayTimeActivity(analytics.timeActivity);
    this.displayMediaStats(analytics.mediaStats);
    
    console.log('='.repeat(60));
    console.log('✅ Улучшенный анализ завершен! Исключены пересылки и теги.');
    console.log('='.repeat(60) + '\n');
  }

  private static displayFilteringStats(exportData: TelegramExport): void {
    const stats = TelegramParser.getFilteringStats(exportData.messages);
    
    console.log('\n🔍 КАЧЕСТВО ДАННЫХ:');
    console.log(`├─ Всего сообщений: ${stats.total.toLocaleString()}`);
    console.log(`├─ Валидных: ${stats.valid.toLocaleString()}`);
    console.log(`├─ Пересланных (исключено): ${stats.forwarded.toLocaleString()}`);
    console.log(`├─ Ответов на пересылки (сохранено): ${stats.repliesToForwarded.toLocaleString()}`);
    console.log(`├─ С тегами @username: ${stats.withUserTags.toLocaleString()}`);
    console.log(`├─ Для анализа: ${stats.finalForAnalysis.toLocaleString()}`);
    console.log(`└─ Для паттернов: ${stats.finalForPatterns.toLocaleString()}`);
    
    const qualityScore = (stats.finalForAnalysis / stats.total * 100).toFixed(1);
    console.log(`\n📈 Качество данных: ${qualityScore}% (чем выше, тем лучше)`);
  }

  private static displayOverview(analytics: ChatAnalytics): void {
    console.log('\n📈 ОБЩАЯ СТАТИСТИКА:');
    console.log(`├─ Качественных сообщений: ${analytics.totalMessages.toLocaleString()}`);
    console.log(`├─ Участников: ${analytics.totalUsers}`);
    console.log(`├─ Период: ${analytics.dateRange.start.toLocaleDateString()} - ${analytics.dateRange.end.toLocaleDateString()}`);
    console.log(`├─ Дней активности: ${analytics.dateRange.days}`);
    console.log(`├─ Сообщений в день: ${analytics.messagesPerDay}`);
    console.log(`└─ Средняя длина: ${analytics.averageMessageLength} символов (без тегов)`);
  }

  private static displayTopUsers(users: UserStats[]): void {
    console.log('\n👥 ТОП ПОЛЬЗОВАТЕЛИ:');
    users.slice(0, 10).forEach((user, index) => {
      const prefix = index === users.length - 1 ? '└─' : '├─';
      console.log(`${prefix} ${index + 1}. ${user.name}: ${user.messageCount.toLocaleString()} сообщений (${user.averageMessageLength} симв./сооб)`);
    });
  }

  private static displayPopularWords(words: Array<{ word: string; count: number }>): void {
    console.log('\n🔤 ПОПУЛЯРНЫЕ СЛОВА (БЕЗ ТЕГОВ):');
    words.slice(0, 15).forEach((word, index) => {
      const prefix = index === 14 ? '└─' : '├─';
      const bar = '█'.repeat(Math.max(1, Math.round(word.count / words[0].count * 20)));
      console.log(`${prefix} ${word.word}: ${word.count} ${bar}`);
    });
  }

  private static displayPopularEmojis(emojis: Array<{ emoji: string; count: number }>): void {
    if (emojis.length === 0) return;
    
    console.log('\n😄 ПОПУЛЯРНЫЕ ЭМОДЗИ:');
    emojis.slice(0, 10).forEach((emoji, index) => {
      const prefix = index === Math.min(9, emojis.length - 1) ? '└─' : '├─';
      const bar = '█'.repeat(Math.max(1, Math.round(emoji.count / emojis[0].count * 15)));
      console.log(`${prefix} ${emoji.emoji}: ${emoji.count} ${bar}`);
    });
  }

  private static displayTimeActivity(timeActivity: { [hour: string]: number }): void {
    console.log('\n🕐 АКТИВНОСТЬ ПО ВРЕМЕНИ:');
    
    // Находим пик активности
    const maxHour = Object.entries(timeActivity)
      .reduce((max, [hour, count]) => count > max.count ? { hour, count } : max, { hour: '0', count: 0 });
    
    for (let hour = 0; hour < 24; hour++) {
      const count = timeActivity[hour] || 0;
      const percentage = maxHour.count > 0 ? Math.round(count / maxHour.count * 100) : 0;
      const bar = '█'.repeat(Math.max(0, Math.round(percentage / 5)));
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const prefix = hour === 23 ? '└─' : '├─';
      console.log(`${prefix} ${timeStr}: ${count.toString().padStart(4)} ${bar}`);
    }
  }

  private static displayMediaStats(mediaStats: any): void {
    console.log('\n📁 МЕДИА ФАЙЛЫ:');
    const entries = Object.entries(mediaStats) as Array<[string, number]>;
    entries.forEach(([type, count], index) => {
      const prefix = index === entries.length - 1 ? '└─' : '├─';
      const emoji = this.getMediaEmoji(type);
      console.log(`${prefix} ${emoji} ${type}: ${count.toLocaleString()}`);
    });
  }

  private static getMediaEmoji(type: string): string {
    const emojis: { [key: string]: string } = {
      photos: '📷',
      videos: '🎥',
      documents: '📄',
      stickers: '🎭',
      voice: '🎤',
      audio: '🎵'
    };
    return emojis[type] || '📎';
  }
}