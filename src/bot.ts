import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { Logger } from './logger.js';
import { ResponseEngine } from './response-engine.js';
import { BotPersonality } from './types.js';
import { promises as fs } from 'fs';

export class DigitalPersonalityBot {
  private bot: TelegramBot;
  private isRunning: boolean = false;
  private responseEngine: ResponseEngine | null = null;

  constructor() {
    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Обработка текстовых сообщений
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        Logger.error('Ошибка при обработке сообщения:', error);
      }
    });

    // Обработка ошибок polling
    this.bot.on('polling_error', (error) => {
      Logger.error('Ошибка polling:', error);
    });

    // Обработка ошибок webhook
    this.bot.on('webhook_error', (error) => {
      Logger.error('Ошибка webhook:', error);
    });
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (config.devMode) {
      Logger.debug('Получено сообщение:', {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title,
        from: msg.from?.first_name,
        text: msg.text?.substring(0, 100) + (msg.text && msg.text.length > 100 ? '...' : '')
      });
    }

    if (!msg.text) return;
    if (config.allowedChatId && msg.chat.id.toString() !== config.allowedChatId) {
      Logger.warn(`Сообщение из неразрешенного чата: ${msg.chat.id}`);
      return;
    }
    if (msg.from?.is_bot) return;

    const userName = msg.from?.first_name || msg.from?.username || 'Unknown';

    // Обновляем контекст независимо от того, будем ли отвечать
    this.responseEngine?.updateContext(userName, msg.text);

    // ОСНОВНАЯ ЛОГИКА ЭТАПА 4: Гейсандр Кулович использует AI + паттерны
    if (this.responseEngine) {
      if (this.responseEngine.shouldRespond(msg.text, userName)) {
        // Показываем индикатор печати для более человечного поведения
        await this.bot.sendChatAction(msg.chat.id, 'typing');
        
        // Добавляем небольшую задержку для реалистичности
        const thinkingTime = Math.random() * 2000 + 1000; // 1-3 секунды
        await new Promise(resolve => setTimeout(resolve, thinkingTime));
        
        const response = await this.responseEngine.generateResponse(msg.text, userName);
        
        if (response) {
          try {
            await this.bot.sendMessage(msg.chat.id, response);
            Logger.info(`Гейсандр Кулович ответил в чат ${msg.chat.id}: "${response.substring(0, 100)}..."`);
          } catch (error) {
            Logger.error('Ошибка при отправке ответа:', error);
          }
        } else {
          Logger.debug('Гейсандр Кулович не придумал что ответить');
        }
      } else {
        Logger.debug('Гейсандр Кулович решил не встревать в разговор');
      }
    } else {
      // Fallback: если характер не загружен
      const responses = [
        "Привет! Что-то голова сегодня не варит, забыл о чем мы говорили...",
        "Йо! Только проснулся, еще не включился в тему",  
        "Здарова! Мозг пока грузится, дай минутку",
        "Привет! Что-то отвлекся, о чем речь?",
        "Хай! Только зашел, что тут происходит?"
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      try {
        await this.bot.sendMessage(msg.chat.id, response);
        Logger.info(`Fallback ответ Гейсандра Куловича: "${response}"`);
      } catch (error) {
        Logger.error('Ошибка при отправке fallback ответа:', error);
      }
    }
  }


  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.bot.stopPolling();
      this.isRunning = false;
      Logger.info('Гейсандр Кулович заснул');
    } catch (error) {
      Logger.error('Ошибка при усыплении Гейсандра Куловича:', error);
    }
  }

  /**
   * Загружает характер бота из файла
   */
  async loadPersonality(personalityPath: string): Promise<void> {
    try {
      Logger.info(`Изучаем характер Гейсандра Куловича из файла: ${personalityPath}`);
      
      const personalityData = await fs.readFile(personalityPath, 'utf-8');
      const personality: BotPersonality = JSON.parse(personalityData);
      
      this.responseEngine = new ResponseEngine(personality);
      
      Logger.info(`✅ Гейсандр Кулович изучил свой характер: ${personality.patterns.length} особенностей`);
      Logger.info(`Режим работы: ${config.aiMode} (модель: ${config.openaiModel})`);
      Logger.info(`Общительность: ${(personality.responseStyle.activityLevel * 100).toFixed(1)}%`);
      
    } catch (error) {
      Logger.error('Ошибка при изучении характера:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Гейсандр Кулович уже активен');
      return;
    }

    try {
      const botInfo = await this.bot.getMe();
      Logger.info(`Гейсандр Кулович проснулся: @${botInfo.username} (${botInfo.first_name})`);
      
      this.isRunning = true;
      
      if (this.responseEngine) {
        Logger.info('🧠 Гейсандр Кулович вспомнил свой характер и готов к общению!');
        Logger.info(`🤖 AI режим: ${config.aiMode} (вероятность: ${(config.aiProbability * 100).toFixed(0)}%)`);
      } else {
        Logger.warn('⚠️ Гейсандр Кулович что-то подзабыл свои привычки (fallback режим)');
        Logger.info('Чтобы Гейсандр вспомнил себя, используйте loadPersonality() перед запуском');
      }

    } catch (error) {
      Logger.error('Ошибка при пробуждении Гейсандра Куловича:', error);
      throw error;
    }
  }

  public getBotInfo(): any {
    return this.bot.getMe();
  }

  public getContextStats() {
    return this.responseEngine?.getContextStats() || null;
  }
}