#!/usr/bin/env bun

// Загружаем переменные окружения в самом начале
import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0 && !key.startsWith('#')) {
      process.env[key.trim()] = values.join('=').trim();
    }
  });
} catch (error) {
  // .env файл не найден - не критично
}

import { HealthMonitor } from '../core/health-monitor.js';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';

/**
 * CLI утилита для проверки здоровья системы
 */
async function runHealthCheck() {
  console.log('🩺 Гейсандр Кулович - Проверка здоровья системы\n');

  const monitor = new HealthMonitor(config.allowedChatId);

  try {
    // Получаем аргументы командной строки
    const args = process.argv.slice(2);
    const isQuick = args.includes('--quick') || args.includes('-q');
    const isWatch = args.includes('--watch') || args.includes('-w');
    const isJson = args.includes('--json');

    if (isQuick) {
      // Быстрая проверка
      console.log('⚡ Быстрая проверка критических компонентов...\n');
      const quickResult = await monitor.quickHealthCheck();
      
      if (isJson) {
        console.log(JSON.stringify(quickResult, null, 2));
      } else {
        const statusIcon = quickResult.status === 'healthy' ? '✅' : 
                          quickResult.status === 'degraded' ? '⚠️' : '❌';
        console.log(`${statusIcon} Статус: ${quickResult.status}`);
        console.log(`📝 Сообщение: ${quickResult.message}`);
      }
    } else {
      // Полная проверка
      console.log('🔍 Полная проверка всех компонентов...\n');
      const healthStatus = await monitor.getHealthStatus();
      
      if (isJson) {
        console.log(JSON.stringify(healthStatus, null, 2));
      } else {
        console.log(monitor.formatHealthStatus(healthStatus));
        
        // Дополнительная информация для разработчиков
        if (config.devMode) {
          console.log('\n📊 Детальная информация:');
          Object.entries(healthStatus.checks).forEach(([name, check]) => {
            if (check.details) {
              console.log(`\n${name.toUpperCase()}:`);
              console.log(JSON.stringify(check.details, null, 2));
            }
          });
        }
      }
    }

    // Режим наблюдения
    if (isWatch) {
      console.log('\n👀 Режим наблюдения активирован (проверка каждые 30 секунд)');
      console.log('Нажмите Ctrl+C для выхода\n');
      
      setInterval(async () => {
        try {
          const quickResult = await monitor.quickHealthCheck();
          const timestamp = new Date().toLocaleTimeString('ru-RU');
          const statusIcon = quickResult.status === 'healthy' ? '✅' : 
                            quickResult.status === 'degraded' ? '⚠️' : '❌';
          
          console.log(`[${timestamp}] ${statusIcon} ${quickResult.status}: ${quickResult.message}`);
        } catch (error) {
          const timestamp = new Date().toLocaleTimeString('ru-RU');
          console.log(`[${timestamp}] ❌ Ошибка проверки: ${error}`);
        }
      }, 30_000);
    } else {
      // Выход для разовой проверки
      const exitCode = getExitCode(isQuick ? 
        { status: (await monitor.quickHealthCheck()).status } : 
        await monitor.getHealthStatus()
      );
      
      process.exit(exitCode);
    }

  } catch (error) {
    console.error('❌ Критическая ошибка health check:', error);
    process.exit(3);
  } finally {
    if (!process.argv.includes('--watch')) {
      monitor.close();
    }
  }
}

/**
 * Определяет код выхода на основе статуса здоровья
 */
function getExitCode(status: { status: string }): number {
  switch (status.status) {
    case 'healthy': return 0;  // Все ОК
    case 'degraded': return 1; // Предупреждения
    case 'unhealthy': return 2; // Критические ошибки
    default: return 3;         // Неизвестная ошибка
  }
}

/**
 * Показывает справку по использованию
 */
function showHelp() {
  console.log(`
🩺 Гейсандр Кулович - Health Check

Использование:
  bun run health-check [опции]

Опции:
  --quick, -q     Быстрая проверка только критических компонентов
  --watch, -w     Режим наблюдения (проверка каждые 30 секунд)
  --json          Вывод в формате JSON
  --help, -h      Показать эту справку

Примеры:
  bun run health-check              # Полная проверка
  bun run health-check --quick      # Быстрая проверка
  bun run health-check --watch      # Мониторинг в реальном времени
  bun run health-check --json       # JSON вывод для скриптов

Коды возврата:
  0 - healthy    (все системы работают)
  1 - degraded   (есть предупреждения)  
  2 - unhealthy  (критические ошибки)
  3 - error      (ошибка самой проверки)
`);
}

// Обработка аргументов
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Запуск проверки
runHealthCheck().catch((error) => {
  console.error('💥 Неожиданная ошибка:', error);
  process.exit(3);
});
