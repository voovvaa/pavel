import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { Logger } from './logger';

export class DigitalPersonalityBot {
  private bot: TelegramBot;
  private isRunning: boolean = false;

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
    // Логируем все входящие сообщения в dev режиме
    if (config.devMode) {
      Logger.debug('Получено сообщение:', {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title,
        from: msg.from?.first_name,
        text: msg.text?.substring(0, 100) + (msg.text && msg.text.length > 100 ? '...' : '')
      });
    }

    // Проверяем, что это текстовое сообщение
    if (!msg.text) {
      return;
    }

    // Проверяем ограничение по чату (если задано)
    if (config.allowedChatId && msg.chat.id.toString() !== config.allowedChatId) {
      Logger.warn(`Сообщение из неразрешенного чата: ${msg.chat.id}`);
      return;
    }

    // Игнорируем свои собственные сообщения
    if (msg.from?.is_bot) {
      return;
    }

    // ОСНОВНАЯ ЛОГИКА ЭТАПА 1: отвечаем "Привет!" на любое сообщение
    const response = "Привет!";
    
    try {
      await this.bot.sendMessage(msg.chat.id, response);
      Logger.info(`Отправлен ответ в чат ${msg.chat.id}: "${response}"`);
    } catch (error) {
      Logger.error('Ошибка при отправке ответа:', error);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Бот уже запущен');
      return;
    }

    try {
      // Получаем информацию о боте
      const botInfo = await this.bot.getMe();
      Logger.info(`Бот запущен: @${botInfo.username} (${botInfo.first_name})`);
      
      this.isRunning = true;
      Logger.info('Бот готов к работе! Отправьте ему сообщение для тестирования.');

    } catch (error) {
      Logger.error('Ошибка при запуске бота:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.bot.stopPolling();
      this.isRunning = false;
      Logger.info('Бот остановлен');
    } catch (error) {
      Logger.error('Ошибка при остановке бота:', error);
    }
  }

  public getBotInfo(): any {
    return this.bot.getMe();
  }
}