export interface Config {
  telegramBotToken: string;
  allowedChatId?: string;
  devMode: boolean;
  openaiApiKey: string;
  openaiModel: string;
  aiMode: 'patterns_only' | 'ai_only' | 'hybrid';
  aiProbability: number;
  // Память
  databasePath: string;
  memoryDays: number;
  summaryAfterMessages: number;
  shortTermLimit: number;
  contextRelevanceThreshold: number;
}

export const config: Config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedChatId: process.env.ALLOWED_CHAT_ID,
  devMode: process.env.DEV_MODE === 'true',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || '', // Пустое значение - будет выбираться интерактивно
  aiMode: (process.env.AI_MODE as any) || 'hybrid',
  aiProbability: parseFloat(process.env.AI_PROBABILITY || '0.8'),
  // Настройки памяти
  databasePath: process.env.DATABASE_PATH || './memory.db',
  memoryDays: parseInt(process.env.MEMORY_DAYS || '30'),
  summaryAfterMessages: parseInt(process.env.SUMMARY_AFTER_MESSAGES || '50'),
  shortTermLimit: parseInt(process.env.SHORT_TERM_LIMIT || '25'),
  contextRelevanceThreshold: parseFloat(process.env.CONTEXT_RELEVANCE_THRESHOLD || '0.7')
};

export function validateConfig(): void {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан в .env файле');
  }
  
  if (config.aiMode !== 'patterns_only' && !config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY не задан в .env файле для AI режима');
  }

  // Упрощенная проверка - только 2 модели
  const validModels = ['gpt-5-nano', 'gpt-5-chat-latest'];
  if (config.openaiModel && !validModels.includes(config.openaiModel)) {
    throw new Error(`OPENAI_MODEL должен быть одним из: ${validModels.join(', ')}`);
  }

  if (config.aiProbability < 0 || config.aiProbability > 1) {
    throw new Error('AI_PROBABILITY должен быть между 0.0 и 1.0');
  }

  if (config.memoryDays < 1 || config.memoryDays > 365) {
    throw new Error('MEMORY_DAYS должен быть между 1 и 365');
  }
}