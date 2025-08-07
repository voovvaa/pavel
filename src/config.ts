export interface Config {
  telegramBotToken: string;
  allowedChatId?: string;
  devMode: boolean;
  openaiApiKey: string;
  openaiModel: string;
  aiMode: 'patterns_only' | 'ai_only' | 'hybrid';
  aiProbability: number;
}

export const config: Config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedChatId: process.env.ALLOWED_CHAT_ID,
  devMode: process.env.DEV_MODE === 'true',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiMode: (process.env.AI_MODE as any) || 'hybrid',
  aiProbability: parseFloat(process.env.AI_PROBABILITY || '0.7')
};

export function validateConfig(): void {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан в .env файле');
  }
  
  if (config.aiMode !== 'patterns_only' && !config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY не задан в .env файле для AI режима');
  }

  if (config.aiProbability < 0 || config.aiProbability > 1) {
    throw new Error('AI_PROBABILITY должен быть между 0.0 и 1.0');
  }
}