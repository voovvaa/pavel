import { TelegramParser } from '../analysis/parser.js';
import { ChatAnalyzer } from '../analysis/analytics.js';
import { PatternExtractor } from '../analysis/pattern-extractor.js';
import { AIEngine } from './ai-engine.js';
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { validateConfig } from '../core/config.js';
import { ModelSelector } from './model-selector.js';

async function main() {
  try {
    // Сначала выбираем модель если не настроена
    const modelSelector = new ModelSelector();
    await modelSelector.ensureModelConfigured();
    
    validateConfig();
    
    const personalityPath = process.argv[2] || './personality.json';
    
    try {
      await fs.access(personalityPath);
    } catch {
      Logger.error(`Файл личности не найден: ${personalityPath}`);
      Logger.error('Создайте личность командой: bun run patterns result_analysis.json');
      process.exit(1);
    }

    Logger.info('🤖 Тестируем AI движок...');
    
    // Загружаем личность
    const personalityData = JSON.parse(await fs.readFile(personalityPath, 'utf-8'));
    const aiEngine = new AIEngine(personalityData);
    
    if (!aiEngine.isAvailable()) {
      Logger.error('AI движок недоступен - проверьте OPENAI_API_KEY');
      process.exit(1);
    }

    // Тестовые сообщения
    const testMessages = [
      'Привет, как дела?',
      'Что думаешь про этот проект?',
      'Гейсандр, расскажи анекдот',
      'Как прошли выходные?',
      'Что нового?'
    ];

    const context = {
      recentMessages: [],
      activeUsers: new Set(['Тестер']),
      messagesSinceLastResponse: 0
    };

    console.log('\n' + '='.repeat(60));
    console.log('🤖 ТЕСТИРОВАНИЕ AI ОТВЕТОВ');
    console.log('='.repeat(60));

    for (const message of testMessages) {
      console.log(`\n👤 Тестер: ${message}`);
      console.log('🤖 Гейсандр думает...');
      
      const response = await aiEngine.generateResponse(message, 'Тестер', context);
      
      if (response) {
        console.log(`🎭 Гейсандр: ${response}`);
        
        // Обновляем контекст для следующего сообщения
        (context.recentMessages as Array<{text: string; author: string; timestamp: Date}>).push(
          { text: message, author: 'Тестер', timestamp: new Date() },
          { text: response, author: 'Гейсандр Кулович', timestamp: new Date() }
        );
      } else {
        console.log('🤐 Гейсандр промолчал');
      }
      
      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('\uD83E\uDD16 ТЕСТИРОВАНИЕ AI ОТВЕТОВ');
    console.log('='.repeat(60));

    for (const message of testMessages) {
      console.log(`\n\uD83D\uDC64 Тестер: ${message}`);
      console.log('\uD83E\uDD16 Гейсандр думает...');
      
      const response = await aiEngine.generateResponse(message, 'Тестер', context);
      
      if (response) {
        console.log(`\uD83C\uDFAD Гейсандр: ${response}`);
        
        // Обновляем контекст для следующего сообщения
        (context.recentMessages as Array<{text: string; author: string; timestamp: Date}>).push(
          { text: message, author: 'Тестер', timestamp: new Date() },
          { text: response, author: 'Гейсандр Кулович', timestamp: new Date() }
        );
      } else {
        console.log('\uD83E\uDD10 Гейсандр промолчал');
      }
      
      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Тестирование AI завершено!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    Logger.error('Ошибка тестирования AI:', error);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}