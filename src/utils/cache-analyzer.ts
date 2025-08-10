#!/usr/bin/env bun

import { cacheManager } from '../core/cache-manager.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';

/**
 * CLI утилита для анализа кэшей системы
 */
async function analyzeCaches() {
  console.log('📊 Анализ кэшей Гейсандра Куловича\n');

  try {
    // Получаем аргументы командной строки
    const args = process.argv.slice(2);
    const chatId = args[0] || config.allowedChatId || 'test';
    const isDetailed = args.includes('--detailed') || args.includes('-d');
    const shouldCleanup = args.includes('--cleanup') || args.includes('-c');
    const shouldWarmup = args.includes('--warmup') || args.includes('-w');
    const shouldClear = args.includes('--clear');

    if (shouldClear) {
      console.log('🧹 Очистка всех кэшей...');
      cacheManager.clearAll();
      console.log('✅ Все кэши очищены\n');
      return;
    }

    // Инициализируем менеджер памяти для получения локальных статистик
    let memoryManager: MemoryManager | null = null;
    if (chatId && chatId !== 'global') {
      try {
        memoryManager = new MemoryManager(chatId);
      } catch (error) {
        console.log(`⚠️ Не удалось подключиться к памяти чата ${chatId}: ${error}\n`);
      }
    }

    // Принудительная очистка просроченных записей
    if (shouldCleanup) {
      console.log('🧽 Очистка просроченных записей...');
      cacheManager.cleanup();
      if (memoryManager) {
        memoryManager.cleanupCaches();
      }
      console.log('✅ Очистка завершена\n');
    }

    // Прогрев кэшей
    if (shouldWarmup && memoryManager) {
      console.log('🔥 Прогрев кэшей...');
      await memoryManager.warmupCaches();
      console.log('✅ Прогрев завершен\n');
    }

    // Глобальная статистика кэшей
    console.log('🌍 Глобальная статистика кэшей:');
    const globalStats = cacheManager.getAllStats();
    const memoryUsage = cacheManager.getMemoryUsage();

    console.log(`├─ Всего кэшей: ${memoryUsage.totalCaches}`);
    console.log(`├─ Всего записей: ${memoryUsage.totalEntries}`);
    console.log(`├─ Использование памяти: ${(memoryUsage.estimatedMemory / 1024).toFixed(1)} КБ`);
    console.log('└─ По типам:');

    Object.entries(globalStats).forEach(([name, stats]) => {
      const hitRateStr = stats.hitRate > 0 ? ` (hit rate: ${(stats.hitRate * 100).toFixed(1)}%)` : '';
      console.log(`   ├─ ${name}: ${stats.totalEntries} записей${hitRateStr}`);
    });

    // Локальная статистика для конкретного чата
    if (memoryManager) {
      console.log(`\n💾 Статистика кэшей чата ${chatId}:`);
      
      if (isDetailed) {
        // Детальный отчет
        const performanceReport = memoryManager.getCachePerformanceReport();
        
        console.log('\n📈 Производительность:');
        Object.entries(performanceReport.localCaches).forEach(([name, stats]: [string, any]) => {
          console.log(`\n${name.toUpperCase()}:`);
          console.log(`  ├─ Записей: ${stats.totalEntries}`);
          console.log(`  ├─ Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
          console.log(`  ├─ Попаданий: ${stats.totalHits}`);
          console.log(`  ├─ Промахов: ${stats.totalMisses}`);
          console.log(`  └─ Память: ${(stats.memoryUsage / 1024).toFixed(1)} КБ`);
        });

        console.log('\n💡 Рекомендации:');
        performanceReport.recommendations.forEach((rec: string) => {
          console.log(`  • ${rec}`);
        });
      } else {
        // Краткая статистика
        const cacheStats = memoryManager.getCacheStats();
        Object.entries(cacheStats).forEach(([name, stats]: [string, any]) => {
          const hitRate = stats.hitRate > 0 ? `${(stats.hitRate * 100).toFixed(1)}%` : 'N/A';
          console.log(`├─ ${name}: ${stats.totalEntries} записей (hit rate: ${hitRate})`);
        });
      }
    }

    // Показываем топ наиболее используемых кэшей
    console.log('\n🔥 Топ активных кэшей:');
    const sortedCaches = Object.entries(globalStats)
      .sort(([,a], [,b]) => (b.totalHits + b.totalMisses) - (a.totalHits + a.totalMisses))
      .slice(0, 5);

    sortedCaches.forEach(([name, stats], index) => {
      const totalRequests = stats.totalHits + stats.totalMisses;
      const prefix = index === sortedCaches.length - 1 ? '└─' : '├─';
      console.log(`${prefix} ${index + 1}. ${name}: ${totalRequests} запросов`);
    });

    // Анализ проблем
    console.log('\n🚨 Анализ проблем:');
    const issues = analyzePerformanceIssues(globalStats, memoryUsage);
    if (issues.length === 0) {
      console.log('└─ ✅ Проблем не обнаружено');
    } else {
      issues.forEach((issue, index) => {
        const prefix = index === issues.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${issue}`);
      });
    }

    // Закрываем соединения
    if (memoryManager) {
      memoryManager.close();
    }

  } catch (error) {
    console.error('❌ Ошибка анализа кэшей:', error);
    process.exit(1);
  }
}

/**
 * Анализирует производительность и находит проблемы
 */
function analyzePerformanceIssues(globalStats: any, memoryUsage: any): string[] {
  const issues: string[] = [];

  // Проверяем использование памяти
  const memoryMB = memoryUsage.estimatedMemory / (1024 * 1024);
  if (memoryMB > 50) {
    issues.push(`🟡 Высокое использование памяти кэшами: ${memoryMB.toFixed(1)} МБ`);
  }
  if (memoryMB > 100) {
    issues.push(`🔴 Критическое использование памяти: ${memoryMB.toFixed(1)} МБ`);
  }

  // Проверяем hit rate
  Object.entries(globalStats).forEach(([name, stats]: [string, any]) => {
    if (stats.totalHits + stats.totalMisses > 100) { // Только для активных кэшей
      if (stats.hitRate < 0.3) {
        issues.push(`🔴 Очень низкий hit rate для ${name}: ${(stats.hitRate * 100).toFixed(1)}%`);
      } else if (stats.hitRate < 0.5) {
        issues.push(`🟡 Низкий hit rate для ${name}: ${(stats.hitRate * 100).toFixed(1)}%`);
      }
    }
  });

  // Проверяем переполнение кэшей
  Object.entries(globalStats).forEach(([name, stats]: [string, any]) => {
    if (stats.totalEntries > 800) {
      issues.push(`🟡 Кэш ${name} близок к переполнению: ${stats.totalEntries} записей`);
    }
  });

  return issues;
}

/**
 * Показывает справку
 */
function showHelp() {
  console.log(`
📊 Анализ кэшей Гейсандра Куловича

Использование:
  bun run cache-stats [chat_id] [опции]

Аргументы:
  chat_id          ID чата для анализа (по умолчанию из конфига)

Опции:
  --detailed, -d   Детальный анализ производительности
  --cleanup, -c    Очистка просроченных записей
  --warmup, -w     Прогрев кэшей популярными данными
  --clear          Полная очистка всех кэшей
  --help, -h       Показать эту справку

Примеры:
  bun run cache-stats                    # Общая статистика
  bun run cache-stats 123456789 -d      # Детальный анализ для чата
  bun run cache-stats --cleanup          # Очистка просроченных записей
  bun run cache-stats --warmup           # Прогрев кэшей
  bun run cache-stats --clear            # Полная очистка

Интерпретация результатов:
  Hit rate > 70%     - Отличная производительность
  Hit rate 50-70%    - Хорошая производительность  
  Hit rate 30-50%    - Удовлетворительная производительность
  Hit rate < 30%     - Требует оптимизации
`);
}

// Обработка аргументов
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Запуск анализа
analyzeCaches().catch((error) => {
  console.error('💥 Критическая ошибка:', error);
  process.exit(1);
});
