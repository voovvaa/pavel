import { TelegramParser } from './parser.js';
import { ChatAnalyzer } from './analytics.js';
import { Logger } from './logger.js';
import { promises as fs } from 'fs';
import { 
  TelegramExport, 
  TelegramExportMessage, 
  ChatAnalytics,
  ResponsePattern,
  TriggerPattern,
  BotPersonality 
} from './types.js';

export class PatternExtractor {
  private export: TelegramExport;
  private analytics: ChatAnalytics;
  private messagesForPatterns: TelegramExportMessage[];

  constructor(exportData: TelegramExport, analytics: ChatAnalytics) {
    this.export = exportData;
    this.analytics = analytics;
    // Используем специальную фильтрацию для паттернов (включает ответы на пересылки)
    this.messagesForPatterns = TelegramParser.filterMessagesForPatterns(exportData.messages);
  }

  /**
   * Извлекает все паттерны и создает личность бота
   */
  extractPersonality(): BotPersonality {
    Logger.info('🧠 Извлекаем паттерны поведения с улучшенной фильтрацией...');
    
    const patterns = this.extractTriggerPatterns();
    const responseStyle = this.analyzeResponseStyle();
    const schedule = this.analyzeActivitySchedule();
    
    const personality: BotPersonality = {
      patterns,
      responseStyle,
      schedule
    };

    Logger.info(`✅ Извлечено качественных паттернов: ${patterns.length}`);
    return personality;
  }

  /**
   * Извлекает паттерны "вопрос-ответ" из диалогов с улучшенной фильтрацией
   */
  private extractTriggerPatterns(): TriggerPattern[] {
    const patterns: TriggerPattern[] = [];
    const questionWords = ['что', 'как', 'где', 'когда', 'почему', 'зачем', 'кто', 'какой'];
    const responseMap = new Map<string, string[]>();

    // Ищем последовательности сообщений для выявления паттернов ответов
    for (let i = 0; i < this.messagesForPatterns.length - 1; i++) {
      const currentMsg = this.messagesForPatterns[i];
      const nextMsg = this.messagesForPatterns[i + 1];
      
      // Используем чистый текст без тегов
      const currentText = TelegramParser.extractCleanText(currentMsg).toLowerCase();
      const nextText = TelegramParser.extractCleanText(nextMsg);
      
      if (!currentText || !nextText) continue;
      if (currentMsg.from === nextMsg.from) continue; // Пропускаем сообщения от одного автора
      
      // Ищем вопросы
      const isQuestion = currentText.includes('?') || 
                        questionWords.some(word => currentText.includes(word));
      
      if (isQuestion && nextText.length > 5 && nextText.length < 200) {
        const key = this.normalizeText(currentText);
        if (!responseMap.has(key)) {
          responseMap.set(key, []);
        }
        responseMap.get(key)!.push(nextText);
      }
    }

    // Создаем паттерны из найденных пар
    let patternId = 1;
    for (const [trigger, responses] of responseMap) {
      if (responses.length >= 2) {
        const keywords = this.extractKeywords(trigger);
        patterns.push({
          id: `pattern_${patternId++}`,
          keywords,
          responses: [...new Set(responses)],
          weight: responses.length,
          context: trigger.substring(0, 100)
        });
      }
    }

    // Добавляем паттерны на основе популярных слов (без тегов)
    const popularWords = this.analytics.popularWords.slice(0, 20);
    for (const wordData of popularWords) {
      const relatedResponses = this.findResponsesToWord(wordData.word);
      if (relatedResponses.length >= 3) {
        patterns.push({
          id: `word_${wordData.word}`,
          keywords: [wordData.word],
          responses: relatedResponses,
          weight: wordData.count / 10,
          context: `Реакции на слово "${wordData.word}"`
        });
      }
    }

    return patterns.sort((a, b) => b.weight - a.weight).slice(0, 50);
  }

  /**
   * Анализирует стиль ответов в чате с чистым текстом
   */
  private analyzeResponseStyle() {
    const allTexts = this.messagesForPatterns
      .map(msg => TelegramParser.extractCleanText(msg))
      .filter(text => text.length > 0);

    const totalLength = allTexts.reduce((sum, text) => sum + text.length, 0);
    const averageLength = Math.round(totalLength / allTexts.length);

    const commonPhrases = this.extractCommonPhrases();
    
    return {
      averageLength,
      commonWords: this.analytics.popularWords.slice(0, 30).map(w => w.word),
      commonEmojis: this.analytics.popularEmojis.slice(0, 15).map(e => e.emoji),
      formalityLevel: this.calculateFormalityLevel(),
      activityLevel: this.calculateActivityLevel()
    };
  }

  /**
   * Анализирует расписание активности
   */
  private analyzeActivitySchedule() {
    // Находим часы с активностью выше среднего
    const hourlyActivity = this.analytics.timeActivity;
    const averageHourly = Object.values(hourlyActivity).reduce((a, b) => a + b, 0) / 24;
    
    const activeHours = Object.entries(hourlyActivity)
      .filter(([_, count]) => count > averageHourly * 0.5)
      .map(([hour, _]) => parseInt(hour));

    // Находим активные дни недели
    const dailyActivity = this.analytics.dayActivity;
    const averageDaily = Object.values(dailyActivity).reduce((a, b) => a + b, 0) / 7;
    
    const activeDays = Object.entries(dailyActivity)
      .filter(([_, count]) => count > averageDaily * 0.3)
      .map(([day, _]) => parseInt(day));

    return {
      activeHours: activeHours.sort((a, b) => a - b),
      activeDays: activeDays.sort((a, b) => a - b)
    };
  }

  /**
   * Извлекает ключевые слова из текста
   */
  private extractKeywords(text: string): string[] {
    const words = TelegramParser.extractWords(text);
    return words.slice(0, 5); // Топ 5 ключевых слов
  }

  /**
   * Нормализует текст для поиска паттернов
   */
  private normalizeText(text: string): string {
    return TelegramParser.cleanTextForWordAnalysis(text)
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  /**
   * Ищет ответы на конкретное слово (с фильтрацией)
   */
  private findResponsesToWord(word: string): string[] {
    const responses: string[] = [];
    
    for (let i = 0; i < this.messagesForPatterns.length - 1; i++) {
      const currentMsg = this.messagesForPatterns[i];
      const nextMsg = this.messagesForPatterns[i + 1];
      
      const currentText = TelegramParser.extractCleanText(currentMsg).toLowerCase();
      const nextText = TelegramParser.extractCleanText(nextMsg);
      
      if (currentText.includes(word.toLowerCase()) && 
          nextText && 
          nextText.length > 3 && 
          nextText.length < 150 &&
          currentMsg.from !== nextMsg.from) {
        responses.push(nextText);
      }
    }
    
    return [...new Set(responses)].slice(0, 10);
  }

  /**
   * Извлекает часто используемые фразы (без тегов)
   */
  private extractCommonPhrases(): string[] {
    const phraseCount = new Map<string, number>();
    
    for (const message of this.messagesForPatterns) {
      const text = TelegramParser.extractCleanText(message);
      if (text.length < 5) continue;
      
      const phrases = text.split(/[.!?]+/).map(p => p.trim()).filter(p => p.length > 10);
      
      for (const phrase of phrases) {
        const normalized = this.normalizeText(phrase);
        if (normalized.length > 10) {
          phraseCount.set(normalized, (phraseCount.get(normalized) || 0) + 1);
        }
      }
    }
    
    return Array.from(phraseCount.entries())
      .filter(([_, count]) => count >= 3)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 20)
      .map(([phrase, _]) => phrase);
  }

  /**
   * Рассчитывает уровень формальности
   */
  private calculateFormalityLevel(): number {
    const allText = this.messagesForPatterns
      .map(msg => TelegramParser.extractCleanText(msg))
      .join(' ')
      .toLowerCase();

    const formalMarkers = ['пожалуйста', 'спасибо', 'благодарю', 'извините', 'простите'];
    const informalMarkers = ['привет', 'пока', 'спасибо', 'дарова', 'здарова', 'хай', 'бай'];
    
    const formalCount = formalMarkers.reduce((count, word) => {
      return count + (allText.match(new RegExp(word, 'g')) || []).length;
    }, 0);
    
    const informalCount = informalMarkers.reduce((count, word) => {
      return count + (allText.match(new RegExp(word, 'g')) || []).length;
    }, 0);
    
    if (formalCount + informalCount === 0) return 0.5;
    return formalCount / (formalCount + informalCount);
  }

  /**
   * Рассчитывает уровень активности
   */
  private calculateActivityLevel(): number {
    const totalMessages = this.messagesForPatterns.length;
    const uniqueUsers = new Set(this.messagesForPatterns.map(msg => 
      TelegramParser.normalizeUserName(msg)
    )).size;
    
    if (uniqueUsers === 0) return 0.1;
    
    const messagesPerUser = totalMessages / uniqueUsers;
    return Math.min(1, messagesPerUser / 1000);
  }
}