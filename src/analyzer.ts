import { TelegramParser } from './parser.js';
import { ChatAnalyzer } from './analytics.js';
import { ConsoleVisualizer } from './visualizer.js';
import { Logger } from './logger.js';
import { promises as fs } from 'fs';

async function main() {
  try {
    // Проверяем аргументы командной строки
    const filePath = process.argv[2];
    if (!filePath) {
      console.log('❌ Укажите путь к файлу экспорта:');
      console.log('   bun run analyze path/to/result.json');
      console.log('');
      console.log('📝 Как получить экспорт:');
      console.log('   1. Откройте Telegram Desktop');
      console.log('   2. Выберите чат → Меню → Экспорт данных чата');
      console.log('   3. Выберите JSON формат');
      console.log('   4. Дождитесь завершения экспорта');
      process.exit(1);
    }

    // Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      Logger.error(`Файл не найден: ${filePath}`);
      process.exit(1);
    }

    Logger.info('🚀 Начинаем улучшенный анализ чата...');
    
    const exportData = await TelegramParser.loadExport(filePath);
    const analyzer = new ChatAnalyzer(exportData);
    const analytics = analyzer.analyze();
    
    // Передаем исходные данные для показа статистики фильтрации
    ConsoleVisualizer.displayAnalytics(analytics, exportData);
    
    const outputPath = filePath.replace('.json', '_analysis.json');
    await fs.writeFile(outputPath, JSON.stringify(analytics, null, 2), 'utf-8');
    Logger.info(`💾 Улучшенный анализ сохранен в: ${outputPath}`);

  } catch (error) {
    Logger.error('Ошибка анализа:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}