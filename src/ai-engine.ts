import OpenAI from 'openai';
import { config } from './config.js';
import { Logger } from './logger.js';
import { BotPersonality, ChatContext } from './types.js';

export class AIEngine {
  private openai: OpenAI;
  private personality: BotPersonality;
  private isEnabled: boolean;

  constructor(personality: BotPersonality) {
    this.personality = personality;
    this.isEnabled = config.aiMode !== 'patterns_only' && !!config.openaiApiKey;
    
    if (this.isEnabled) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
      Logger.info(`🤖 AI движок активирован (модель: ${config.openaiModel})`);
    } else {
      Logger.info('🔧 AI движок отключен - используются только паттерны');
    }
  }

  /**
   * Генерирует ответ с помощью OpenAI
   */
  async generateResponse(
    messageText: string, 
    author: string, 
    context: ChatContext
  ): Promise<string | null> {
    if (!this.isEnabled) {
      Logger.debug('AI движок отключен');
      return null;
    }

    try {
      const prompt = this.buildPrompt(messageText, author, context);
      
      Logger.debug('Отправляем запрос в OpenAI...');
      const response = await this.openai.chat.completions.create({
        model: config.openaiModel,
        messages: [
          {
            role: 'system',
            content: prompt.system
          },
          {
            role: 'user', 
            content: prompt.user
          }
        ],
        max_tokens: Math.max(50, Math.min(400, Math.round(this.personality.responseStyle.averageLength * 2))),
        temperature: 0.9,
        presence_penalty: 0.8,
        frequency_penalty: 0.5
      });

      const aiResponse = response.choices[0]?.message?.content?.trim();
      
      if (aiResponse) {
        // ОБЯЗАТЕЛЬНО убираем подпись имени из ответа
        let cleanResponse = aiResponse;
        
        // Удаляем все возможные варианты подписи в начале
        const namePatterns = [
          /^Гейсандр\s*Кулович\s*:\s*/i,
          /^Гейсандр\s*:\s*/i,
          /^Геясандр\s*:\s*/i,
          /^Саня\s*:\s*/i,
          /^Шурик\s*:\s*/i,
          /^Александр\s*:\s*/i,
          /^Алекс\s*:\s*/i,
        ];
        
        for (const pattern of namePatterns) {
          cleanResponse = cleanResponse.replace(pattern, '');
        }
        
        // Убираем лишние пробелы в начале
        cleanResponse = cleanResponse.trim();
        
        if (cleanResponse) {
          Logger.info(`🤖 AI сгенерировал ответ: "${cleanResponse.substring(0, 50)}..."`);
          return cleanResponse;
        } else {
          Logger.warn('AI вернул только подпись имени, без содержания');
          return null;
        }
      } else {
        Logger.warn('AI вернул пустой ответ');
        return null;
      }
      
    } catch (error) {
      Logger.error('Ошибка при обращении к OpenAI:', error);
      return null;
    }
  }

  /**
   * Строит промпт для OpenAI на основе личности и контекста
   */
  private buildPrompt(messageText: string, author: string, context: ChatContext): {
    system: string;
    user: string;
  } {
    const recentContext = context.recentMessages
      .slice(-5)
      .map(msg => `${msg.author}: ${msg.text}`)
      .join('\n');

    const popularWords = this.personality.responseStyle.commonWords.slice(0, 15).join(', ');
    const popularEmojis = this.personality.responseStyle.commonEmojis.slice(0, 5).join(' '); // Уменьшили с 8 до 5
    
    const formalityDescription = this.personality.responseStyle.formalityLevel > 0.7 
      ? 'вежливо и формально' 
      : this.personality.responseStyle.formalityLevel > 0.3
      ? 'дружелюбно и неформально'
      : 'очень расслабленно, с жаргоном и сленгом';

    const system = `Ты участник этого Telegram чата. Отвечай как обычный человек.

КРИТИЧЕСКИ ВАЖНО:
- НЕ ПИШИ СВОЕ ИМЯ в ответе  
- НЕ ПОДПИСЫВАЙСЯ никак
- НЕ пиши "Гейсандр:", "Саня:" или любые другие имена
- Просто отвечай содержанием сообщения

ТВОЙ СТИЛЬ:
- Общаешься ${formalityDescription}
- Длина сообщений: примерно ${this.personality.responseStyle.averageLength} символов
- Используешь слова: ${popularWords}
- Редко используешь эмодзи: ${popularEmojis}

СТРОГИЕ ПРАВИЛА:
1. НИКАКИХ ПОДПИСЕЙ И ИМЕН В ОТВЕТЕ
2. НЕ упоминай что ты AI/бот
3. Отвечай естественно, как участник чата
4. Эмодзи используй очень редко
5. НЕ используй markdown
6. Будь живым, но не переигрывай

КОНТЕКСТ:
${recentContext}

Ответь на последнее сообщение БЕЗ ПОДПИСИ:`;

    const user = `${author}: ${messageText}`;

    return { system, user };
  }

  /**
   * Проверяет доступность AI
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Получает информацию о модели
   */
  getModelInfo(): string {
    return this.isEnabled ? config.openaiModel : 'отключен';
  }
}