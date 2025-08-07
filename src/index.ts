import { DigitalPersonalityBot } from './bot.js';
import { validateConfig } from './config.js';
import { Logger } from './logger.js';
import { promises as fs } from 'fs';

async function main(): Promise<void> {
  try {
    validateConfig();
    Logger.info('Конфигурация валидна');

    const bot = new DigitalPersonalityBot();
    
    // Пытаемся загрузить личность, если файл существует
    const personalityPath = process.env.PERSONALITY_FILE || './personality.json';
    try {
      await fs.access(personalityPath);
      await bot.loadPersonality(personalityPath);
      Logger.info('🧠 Гейсандр Кулович вспомнил свои привычки!');
    } catch {
      Logger.warn(`⚠️ Файл личности не найден: ${personalityPath}`);
      Logger.warn('Гейсандр Кулович что-то подзабыл свои привычки, работает интуитивно');
      Logger.info('Чтобы Гейсандр Кулович вспомнил манеры чата:');
      Logger.info('  1. Изучите чат: bun run analyze result.json');
      Logger.info('  2. Создайте характер: bun run patterns result_analysis.json');
      Logger.info('  3. Перезапустите Гейсандра Куловича');
    }

    await bot.start();

    // Обработка graceful shutdown
    process.on('SIGINT', async () => {
      Logger.info('Получен сигнал SIGINT, останавливаем бота...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      Logger.info('Получен сигнал SIGTERM, останавливаем бота...');
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