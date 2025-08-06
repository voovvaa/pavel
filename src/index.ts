import { DigitalPersonalityBot } from './bot';
import { validateConfig } from './config';
import { Logger } from './logger';

async function main(): Promise<void> {
  try {
    // Проверяем конфигурацию
    validateConfig();
    Logger.info('Конфигурация валидна');

    // Создаем и запускаем бота
    const bot = new DigitalPersonalityBot();
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