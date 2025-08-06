// В Bun переменные окружения доступны через process.env без dotenv

export interface Config {
  telegramBotToken: string;
  allowedChatId?: string;
  devMode: boolean;
}

export const config: Config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedChatId: process.env.ALLOWED_CHAT_ID,
  devMode: process.env.DEV_MODE === 'true'
};

// Валидация конфигурации
export function validateConfig(): void {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан в .env файле');
  }
}