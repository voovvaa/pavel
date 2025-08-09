import { DigitalPersonalityBot } from './core/bot.js';
import { validateConfig } from './core/config.js';
import { Logger } from './utils/logger.js';
import { ModelSelector } from './ai/model-selector.js';

async function main() {
  try {
    Logger.info('🤖 Запуск цифровой личности...');
    
    // Интерактивный выбор модели если не настроена
    const modelSelector = new ModelSelector();
    await modelSelector.ensureModelConfigured();
    
    // Валидация конфигурации
    validateConfig();
    
    // Запуск бота
    const bot = new DigitalPersonalityBot();
    await bot.start();
  } catch (error) {
    Logger.error('Критическая ошибка при запуске:', error);
    process.exit(1);
  }
}

main();