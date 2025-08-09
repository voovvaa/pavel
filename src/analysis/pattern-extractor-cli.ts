import { TelegramParser } from './parser.js';
import { ChatAnalyzer } from './analytics.js';
import { PatternExtractor } from './pattern-extractor.js';
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';

async function main() {
  try {
    const analysisPath = process.argv[2];
    if (!analysisPath) {
      console.log('❌ Укажите путь к файлу анализа:');
      console.log('   bun run patterns path/to/result_analysis.json');
      console.log('');
      console.log('📝 Файл анализа создается командой:');
      console.log('   bun run analyze path/to/result.json');
      process.exit(1);
    }

    // Проверяем существование файла анализа
    try {
      await fs.access(analysisPath);
    } catch {
      Logger.error(`Файл анализа не найден: ${analysisPath}`);
      process.exit(1);
    }

    // Также нужен оригинальный экспорт для извлечения паттернов
    const originalPath = analysisPath.replace('_analysis.json', '.json');
    try {
      await fs.access(originalPath);
    } catch {
      Logger.error(`Оригинальный экспорт не найден: ${originalPath}`);
      Logger.error('Убедитесь что рядом с анализом лежит оригинальный result.json');
      process.exit(1);
    }

    Logger.info('🧠 Извлекаем паттерны поведения...');
    
    // Загружаем анализ и оригинальный экспорт
    const analyticsData = JSON.parse(await fs.readFile(analysisPath, 'utf-8'));
    const exportData = await TelegramParser.loadExport(originalPath);
    
    // Извлекаем паттерны
    const extractor = new PatternExtractor(exportData, analyticsData);
    const personality = extractor.extractPersonality();
    
    // Сохраняем личность
    const personalityPath = analysisPath.replace('_analysis.json', '_personality.json');
    await fs.writeFile(personalityPath, JSON.stringify(personality, null, 2), 'utf-8');
    
    // Выводим статистику
    console.log('\n' + '='.repeat(60));
    console.log('🧠 ХАРАКТЕР ГЕЙСАНДРА КУЛОВИЧА');
    console.log('='.repeat(60));
    
    console.log('\n📊 ОСОБЕННОСТИ ХАРАКТЕРА:');
    console.log(`├─ Изучено манер общения: ${personality.patterns.length}`);
    console.log(`├─ Средняя длина реплик: ${personality.responseStyle.averageLength} символов`);
    console.log(`├─ Степень вежливости: ${(personality.responseStyle.formalityLevel * 100).toFixed(1)}%`);
    console.log(`└─ Общительность: ${(personality.responseStyle.activityLevel * 100).toFixed(1)}%`);
    
    console.log('\n🕐 РЕЖИМ ДНЯ:');
    console.log(`├─ Активен в часы: ${personality.schedule.activeHours.map(h => h + ':00').join(', ')}`);
    console.log(`└─ Активные дни: ${personality.schedule.activeDays.map(d => ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d]).join(', ')}`);
    
    console.log('\n🎯 ТОП-10 ЛЮБИМЫХ ТЕМ:');
    personality.patterns.slice(0, 10).forEach((pattern, index) => {
      const prefix = index === 9 ? '└─' : '├─';
      console.log(`${prefix} ${pattern.keywords.join(', ')} → ${pattern.responses.length} вариантов реакций`);
    });
    
    console.log('\n📝 МАНЕРА РЕЧИ:');
    console.log(`├─ Любимые словечки: ${personality.responseStyle.commonWords.slice(0, 10).join(', ')}`);
    console.log(`└─ Любимые смайлы: ${personality.responseStyle.commonEmojis.slice(0, 10).join(' ')}`);
    
    console.log('\n' + '='.repeat(60));
    console.log(`💾 Характер Гейсандра Куловича записан: ${personalityPath}`);
    console.log('✅ Готово! Теперь Гейсандр Кулович помнит как себя вести в этом чате.');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    Logger.error('Ошибка извлечения паттернов:', error);
    process.exit(1);
  }
}

// Запускаем только если это основной модуль
if (process.argv[1]?.includes('pattern-extractor-cli')) {
  main();
}