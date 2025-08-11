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