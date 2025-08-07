import { DigitalPersonalityBot } from './bot.js';
import { validateConfig, config } from './config.js';
import { Logger } from './logger.js';
import { promises as fs } from 'fs';

async function main(): Promise<void> {
  try {
    validateConfig();
    Logger.info('Конфигурация валидна');
    
    // Показываем режим работы
    Logger.info(`🤖 Режим AI: ${config.aiMode}`);
    if (config.aiMode === 'hybrid') {
      Logger.info(`📊 Вероятность AI: ${(config.aiProbability * 100).toFixed(0)}%`);
    }

    const bot = new DigitalPersonalityBot();
    
    // Пытаемся загрузить характер
    const personalityPath = process.env.PERSONALITY_FILE || './personality.json';
    try {
      await fs.access(personalityPath);
      await bot.loadPersonality(personalityPath);
      Logger.info('🧠 Гейсандр Кулович вспомнил свои привычки!');
    } catch {
      Logger.warn(`⚠️ Файл характера не найден: ${personalityPath}`);
      Logger.warn('Гейсандр Кулович что-то подзабыл свои привычки, работает интуитивно');
      Logger.info('Чтобы Гейсандр Кулович вспомнил манеры чата:');
      Logger.info('  1. Изучите чат: bun run analyze result.json');
      Logger.info('  2. Создайте характер: bun run patterns result_analysis.json');
      Logger.info('  3. Перезапустите Гейсандра Куловича');
    }

    await bot.start();

    // Обработка graceful shutdown
    process.on('SIGINT', async () => {
      Logger.info('Получен сигнал SIGINT, Гейсандр Кулович засыпает...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      Logger.info('Получен сигнал SIGTERM, Гейсандр Кулович засыпает...');
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    Logger.error('Ошибка запуска приложения:', error);
    process.exit(1);
  }
}

// Запускаем приложение
main().catch((error) => {
  Logger.error('Необработанная ошибка:', error);
  process.exit(1);
});