import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { Logger } from '../utils/logger.js';
import { ResponseEngine } from '../ai/response-engine.js';
import { ImageAnalyzer, ImageContext } from '../ai/image-analyzer.js';
import { BotPersonality } from './types.js';
import { HealthMonitor, HealthStatus } from './health-monitor.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export class DigitalPersonalityBot {
  private bot: TelegramBot;
  private isRunning: boolean = false;
  private responseEngine: ResponseEngine | null = null;
  private imageAnalyzer: ImageAnalyzer | null = null;
  private chatId: string | null = null;
  private processingImages: Set<string> = new Set(); // Защита от множественной обработки
  private healthMonitor: HealthMonitor | null = null;
  private lastHealthCheck: Date | null = null;

  constructor() {
    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Обработка всех сообщений (текст + изображения)
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
    // Получаем текст сообщения (может быть в text или caption)
    const messageText = msg.text || msg.caption || '';
    
    if (config.devMode) {
      Logger.debug('Получено сообщение:', {
        chatId: msg.chat.id,
        messageId: msg.message_id,
        chatTitle: msg.chat.title,
        from: msg.from?.first_name,
        text: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '')
      });
    }

    // Проверяем разрешенные чаты
    if (config.allowedChatId && msg.chat.id.toString() !== config.allowedChatId) {
      Logger.warn(`Сообщение из неразрешенного чата: ${msg.chat.id}`);
      return;
    }
    if (msg.from?.is_bot) return;

    // Определяем тип сообщения
    const hasText = !!(msg.text || msg.caption);
    const hasImage = !!(msg.photo && msg.photo.length > 0);
    const hasDocument = !!(msg.document && msg.document.mime_type?.startsWith('image/'));
    const hasVoice = !!msg.voice;
    const hasAudio = !!msg.audio;
    const hasVideo = !!msg.video;
    const hasVideoNote = !!msg.video_note;
    const hasSticker = !!msg.sticker;
    const hasAnimation = !!msg.animation;
    const hasOtherDocument = !!(msg.document && !msg.document.mime_type?.startsWith('image/'));
    
    // Определяем есть ли вообще контент для обработки
    const hasAnyContent = hasText || hasImage || hasDocument || hasVoice || 
                         hasAudio || hasVideo || hasVideoNote || hasSticker || 
                         hasAnimation || hasOtherDocument;

    // Пропускаем только служебные сообщения без контента
    if (!hasAnyContent) return;

    const userName = msg.from?.first_name || msg.from?.username || 'Unknown';
    const currentChatId = msg.chat.id.toString();

    // Инициализируем память при первом сообщении
    if (this.responseEngine && this.chatId !== currentChatId) {
      this.chatId = currentChatId;
      this.responseEngine.initializeMemory(this.chatId);
      Logger.info(`🧠 Память активирована для чата: ${this.chatId}`);
    } else if (this.responseEngine && !this.chatId) {
      // Первое сообщение - инициализируем память
      this.chatId = currentChatId;
      this.responseEngine.initializeMemory(this.chatId);
      Logger.info(`🧠 Память активирована для чата: ${this.chatId}`);
    }

    // ЭТАП 7: Подготавливаем для возможного анализа изображений
    let imageAnalysis = null;
    const hasAnalyzableImage = (hasImage || hasDocument) && this.imageAnalyzer;
    
    // Решаем стоит ли анализировать изображение (экономия API calls)
    const shouldAnalyzeImage = hasAnalyzableImage && this.shouldAnalyzeImage(msg, userName, messageText);

    // Сохраняем входящее сообщение в память
    if (this.responseEngine) {
      let memorySaveText = messageText;
      let messageType: 'text' | 'image' | 'media' = 'text';
      
      // Определяем текст и тип сообщения для сохранения в память
      if (hasImage || hasDocument) {
        memorySaveText = messageText ? `[Изображение: ${messageText}]` : '[Изображение]'; // Добавляем caption если есть
        messageType = 'image';
      } else if (hasVoice) {
        memorySaveText = '[Голосовое сообщение]';
        messageType = 'media';
      } else if (hasAudio) {
        const audioTitle = msg.audio?.title || 'аудиофайл';
        memorySaveText = `[Аудио: ${audioTitle}]`;
        messageType = 'media';
      } else if (hasVideo) {
        memorySaveText = '[Видео]';
        messageType = 'media';
      } else if (hasVideoNote) {
        memorySaveText = '[Видеосообщение]';
        messageType = 'media';
      } else if (hasSticker) {
        const stickerEmoji = msg.sticker?.emoji || '🔥';
        memorySaveText = `[Стикер ${stickerEmoji}]`;
        messageType = 'media';
      } else if (hasAnimation) {
        memorySaveText = '[GIF/анимация]';
        messageType = 'media';
      } else if (hasOtherDocument) {
        const fileName = msg.document?.file_name || 'документ';
        memorySaveText = `[Документ: ${fileName}]`;
        messageType = 'media';
      } else if (!hasText) {
        memorySaveText = '[Неизвестный тип медиа]';
        messageType = 'media';
      }
      
      // Сохраняем в память (для изображений - только если НЕ будем анализировать)
      // Если будем анализировать - сохраним позже с результатами анализа
      if (!(hasImage || hasDocument) || !shouldAnalyzeImage) {
        this.responseEngine.updateContext(
          userName, 
          memorySaveText, 
          msg.message_id, 
          messageType,
          undefined
        );
      }
    }

    // ОСНОВНАЯ ЛОГИКА: Гейсандр с долгосрочной памятью и анализом изображений
    if (this.responseEngine) {
      // Определяем стоит ли отвечать на разные типы контента
      const shouldRespondToText = hasText && messageText && this.responseEngine.shouldRespond(messageText, userName);
      const shouldRespondToMedia = this.shouldRespondToMedia(msg, userName);
      
      if (shouldRespondToText || shouldAnalyzeImage || shouldRespondToMedia) {
        // Показываем индикатор печати для более человечного поведения
        await this.bot.sendChatAction(msg.chat.id, 'typing');
        
        // Задержка для реалистичности (больше времени на анализ изображений)
        const baseThinking = hasImage || hasDocument ? 3000 : 2000;
        const thinkingTime = Math.random() * 3000 + baseThinking;
        await new Promise(resolve => setTimeout(resolve, thinkingTime));
        
        let response = null;
        
        // Обработка изображений (загружаем только если решили анализировать)
        if (shouldAnalyzeImage && this.imageAnalyzer) {
          // Создаем уникальный ключ для изображения (messageId + userId)
          const imageKey = `${msg.message_id}_${msg.from?.id || 'unknown'}`;
          
          // КРИТИЧЕСКАЯ ПРОВЕРКА: не обрабатывается ли уже это изображение
          if (this.processingImages.has(imageKey)) {
            Logger.debug(`🚫 Изображение ${imageKey} уже обрабатывается - пропускаем ВЕСЬ процесс`);
            // ВАЖНО: сохраняем в память даже если пропускаем анализ
            const skipMemoryText = messageText ? `[Изображение] ${messageText}` : '[Изображение]';
            this.responseEngine.updateContext(
              userName, 
              skipMemoryText, 
              msg.message_id, 
              'image',
              undefined
            );
            return; // Полностью выходим из обработки
          }
          
          // Добавляем в обработку ПЕРЕД любыми действиями
          this.processingImages.add(imageKey);
          Logger.debug(`🔒 Заблокировали обработку изображения ${imageKey}`);
          
          try {
            Logger.debug(`🖼️ Загружаем изображение от ${userName} для анализа...`);
            const imageBuffer = await this.downloadImage(msg);
            if (imageBuffer) {
              const imageContext: ImageContext = {
                chatContext: this.responseEngine.getRecentMessages() || [],
                userName,
                userProfile: this.responseEngine.getUserProfile?.(userName) || undefined,
                personality: this.responseEngine.getPersonality() || {} as BotPersonality,
                messageText: messageText // Добавляем текст сообщения для контекста
              };
              
              imageAnalysis = await this.imageAnalyzer.analyzeImage(imageBuffer, imageContext);
              
              if (imageAnalysis) {
                Logger.info(`🖼️ Изображение от ${userName}: ${imageAnalysis.description}`);
                
                // Обновляем сохранение в память с результатами анализа
                const imageMemoryText = messageText 
                  ? `[Изображение: ${imageAnalysis.description}] ${messageText}` 
                  : `[Изображение: ${imageAnalysis.description}]`;
                this.responseEngine.updateContext(
                  userName, 
                  imageMemoryText, 
                  msg.message_id, 
                  'image',
                  imageAnalysis
                );
              }
              
              if (imageAnalysis && this.shouldRespondToImage(imageAnalysis, userName, messageText)) {
                response = await this.imageAnalyzer.generateImageResponse(imageAnalysis, imageContext);
              }
            }
          } catch (error) {
            Logger.error('Ошибка при обработке изображения:', error);
            // Сохраняем в память без анализа в случае ошибки
            const errorMemoryText = messageText ? `[Изображение] ${messageText}` : '[Изображение]';
            this.responseEngine.updateContext(
              userName, 
              errorMemoryText, 
              msg.message_id, 
              'image',
              undefined
            );
          } finally {
            // Всегда удаляем из кэша после завершения обработки
            this.processingImages.delete(imageKey);
          }
        } else if (hasAnalyzableImage) {
          // Если есть изображение, но мы решили не анализировать - все равно сохраняем
          Logger.debug(`🖼️ Пропускаем анализ изображения от ${userName}`);
          const skipMemoryText = messageText ? `[Изображение] ${messageText}` : '[Изображение]';
          this.responseEngine.updateContext(
            userName, 
            skipMemoryText, 
            msg.message_id, 
            'image',
            undefined
          );
        }
        
        // Если не получили ответ на изображение, пробуем другие типы контента
        if (!response && shouldRespondToText && messageText) {
          response = await this.responseEngine.generateResponse(messageText, userName, msg.message_id);
        } else if (!response && shouldRespondToMedia) {
          response = this.generateMediaResponse(msg, userName);
        }
        
        if (response) {
          try {
            const sentMessage = await this.bot.sendMessage(msg.chat.id, response);
            let logContent = '';
            if (hasImage || hasDocument) {
              logContent = `изображение (${imageAnalysis?.type}): "${response.substring(0, 100)}..."`;
            } else if (hasVoice || hasAudio || hasVideo || hasVideoNote || hasSticker || hasAnimation || hasOtherDocument) {
              logContent = `медиа: "${response.substring(0, 100)}..."`;
            } else {
              logContent = `текст: "${response.substring(0, 100)}..."`;
            }
            Logger.info(`Гейсандр Кулович ответил на ${logContent}`);
            
            // Сохраняем свой ответ в память
            if (sentMessage.message_id) {
              this.responseEngine.updateContext('Гейсандр Кулович', response, sentMessage.message_id);
            }
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
      // Fallback если характер не загружен - в стиле Гейсандра Куловича
      const responses = [
        "Привет! Что-то башка сегодня не варит, забыл о чем базарили...",
        "Йо! Только проснулся, еще не врубился в тему",  
        "Здарова! Мозги пока грузятся, дай минутку",
        "Приветствую! Что-то отвлекся на заводские дела, о чем речь?",
        "Хай! Только подтянулся, что тут происходит?",
        "Да нормально все, просто голова пока туго соображает",
        "Салют! Еще не врубился что к чему, поясни",
        "Йо-йо! Башка после смены не очень, напомни о чем говорили"
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

  /**
   * Загружает изображение из сообщения Telegram
   */
  private async downloadImage(msg: TelegramBot.Message): Promise<Buffer | null> {
    try {
      let fileId: string | undefined;
      
      // Обработка фото (выбираем самое большое разрешение)
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1]; // Последнее = наибольшее разрешение
        fileId = photo.file_id;
      }
      // Обработка документа-изображения
      else if (msg.document && msg.document.mime_type?.startsWith('image/')) {
        fileId = msg.document.file_id;
      }
      
      if (!fileId) {
        Logger.debug('❌ Не найден file_id для загрузки изображения');
        return null;
      }
      
      // Получаем информацию о файле
      const fileInfo = await this.bot.getFile(fileId);
      
      if (!fileInfo.file_path) {
        Logger.debug('❌ Не найден file_path для изображения');
        return null;
      }
      
      // Загружаем файл - downloadFile возвращает путь к файлу, не Buffer  
      // Используем абсолютный путь для надежности
      const filePath = await this.bot.downloadFile(fileId, './temp') as string;
      
      if (typeof filePath === 'string' && filePath.length > 0) {
        // Читаем файл в Buffer - путь может быть относительным или абсолютным
        const fs = await import('fs');
        const path = await import('path');
        
        // Проверяем существование файла по разным возможным путям
        let actualPath = filePath;
        if (!fs.existsSync(filePath)) {
          // Пробуем абсолютный путь от корня проекта
          actualPath = path.resolve(filePath);
        }
        
        if (!fs.existsSync(actualPath)) {
          Logger.debug(`❌ Файл не найден ни по пути ${filePath}, ни по пути ${actualPath}`);
          return null;
        }
        
        const fileBuffer = fs.readFileSync(actualPath);
        
        // Удаляем временный файл
        fs.unlinkSync(actualPath);
        
        Logger.debug(`✅ Изображение загружено: ${fileBuffer.length} байт`);
        return fileBuffer;
      } else {
        Logger.debug(`❌ downloadFile вернул неожиданный результат: ${typeof filePath}`);
      }
      
      return null;
      
    } catch (error: any) {
      Logger.error('❌ ОШИБКА при загрузке изображения:', error);
      return null;
    }
  }

  /**
   * Определяет стоит ли реагировать на изображение
   */
  /**
   * Решает стоит ли анализировать изображение ПЕРЕД загрузкой (экономия API calls)
   */
  private shouldAnalyzeImage(msg: TelegramBot.Message, userName: string, messageText: string): boolean {
    // СНАЧАЛА ПРОВЕРЯЕМ RATE LIMIT - даже для текстовых запросов  
    if (this.imageAnalyzer) {
      const usageStats = this.imageAnalyzer.getUsageStats();
      if (usageStats.rateLimitedUsers.includes(userName)) {
        Logger.debug(`⏰ Rate limit блокирует анализ изображения от ${userName}`);
        return false;
      }
    }
    
    // ВСЕГДА анализируем если есть текст с изображением - пользователь что-то спрашивает
    if (messageText && messageText.trim()) {
      return true;
    }
    
    // Базовые вероятности для разных ситуаций без текста
    const random = Math.random();
    
    // 60% шанс анализировать обычные изображения
    // (можно настроить под бюджет)
    return random < 0.6;
  }

  private shouldRespondToImage(imageAnalysis: any, userName: string, messageText: string): boolean {
    // Если мы дошли до анализа - значит уже решили что стоит отвечать
    // Но можем добавить дополнительные фильтры
    
    // Всегда отвечаем если пользователь написал текст с изображением
    if (messageText && messageText.trim()) {
      return true;
    }
    
    // Всегда реагируем на юмор и мемы
    if (imageAnalysis.isHumorous || imageAnalysis.type === 'meme') {
      return true;
    }
    
    // Реагируем на изображения с текстом (OCR)
    if (imageAnalysis.containsText && imageAnalysis.textContent) {
      return true;
    }
    
    // На остальные - 80% шанс (мы уже потратили деньги на анализ, стоит ответить)
    return Math.random() < 0.8;
  }

  /**
   * Определяет стоит ли реагировать на медиа контент
   */
  private shouldRespondToMedia(msg: TelegramBot.Message, userName: string): boolean {
    // Чаще реагируем на стикеры (они обычно эмоциональные)
    if (msg.sticker) {
      return Math.random() < 0.4; // 40% шанс
    }
    
    // Средне реагируем на голосовые и видео сообщения
    if (msg.voice || msg.video_note) {
      return Math.random() < 0.3; // 30% шанс
    }
    
    // Реже на аудио и видео файлы
    if (msg.audio || msg.video) {
      return Math.random() < 0.2; // 20% шанс
    }
    
    // Редко на документы и анимации
    if (msg.document || msg.animation) {
      return Math.random() < 0.15; // 15% шанс
    }
    
    return false;
  }

  /**
   * Генерирует ответ на медиа контент
   */
  private generateMediaResponse(msg: TelegramBot.Message, userName: string): string | null {
    const responses = {
      sticker: [
        "Норм стикер",
        "Хах, в точку",
        "Неплохой стикер", 
        "👍",
        "Лол",
        "Прикольно",
        "В тему"
      ],
      voice: [
        "Слышу, слышу",
        "Голосовуху прислал, серьезные дела что ли",
        "Не могу послушать щас, но принял",
        "Что там говоришь?",
        "Голосом базарим, солидно",
        "Ну давай, рассказывай"
      ],
      video_note: [
        "Кружочек записал, че там?",
        "Видосик глянул",
        "Что там показываешь?",
        "Интересно",
        "Принял, посмотрю",
        "Важные новости?"
      ],
      audio: [
        "Музыка что ли?",
        "Что за трек прислал?",
        "Послушаю попозже",
        "Что за аудио?",
        "Музон?"
      ],
      video: [
        "Видос прислал, глянем",
        "Что там интересного?",
        "Видео принял",
        "Посмотрим что там",
        "Че за видео?"
      ],
      animation: [
        "Гифка норм",
        "Анимация зачетная",
        "Движуха",
        "Прикольная гифка",
        "Неплохая анимация"
      ],
      document: [
        "Документ получен",
        "Что за файлы прислал?",
        "Посмотрю что тут",
        "Файлы принял",
        "Че за документы?"
      ]
    };

    let mediaType: string | null = null;
    
    if (msg.sticker) mediaType = 'sticker';
    else if (msg.voice) mediaType = 'voice';
    else if (msg.video_note) mediaType = 'video_note';
    else if (msg.audio) mediaType = 'audio';
    else if (msg.video) mediaType = 'video';
    else if (msg.animation) mediaType = 'animation';
    else if (msg.document) mediaType = 'document';

    if (mediaType && responses[mediaType as keyof typeof responses]) {
      const mediaResponses = responses[mediaType as keyof typeof responses];
      return mediaResponses[Math.floor(Math.random() * mediaResponses.length)];
    }

    return null;
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Закрываем соединения с памятью
      if (this.responseEngine) {
        this.responseEngine.close();
      }
      
      // Закрываем health monitor
      if (this.healthMonitor) {
        this.healthMonitor.close();
      }
      
      await this.bot.stopPolling();
      this.isRunning = false;
      Logger.info('Гейсандр Кулович заснул и сохранил воспоминания');
    } catch (error) {
      Logger.error('Ошибка при усыплении Гейсандра Куловича:', error);
    }
  }

  /**
   * Загружает характер бота из файла и инициализирует память
   */
  async loadPersonality(personalityPath: string): Promise<void> {
    try {
      Logger.info(`Изучаем характер Гейсандра Куловича из файла: ${personalityPath}`);
      
      const personalityData = await fs.readFile(personalityPath, 'utf-8');
      const personality: BotPersonality = JSON.parse(personalityData);
      
      // Создаем движок ответов БЕЗ памяти пока не знаем chatId
      this.responseEngine = new ResponseEngine(personality);
      
      // Создаем анализатор изображений
      this.imageAnalyzer = new ImageAnalyzer(personality);
      
      Logger.info(`✅ Гейсандр Кулович изучил свой характер: ${personality.patterns.length} особенностей`);
      Logger.info(`Режим работы: ${config.aiMode} (модель: ${config.openaiModel})`);
      Logger.info(`Общительность: ${(personality.responseStyle.activityLevel * 100).toFixed(1)}%`);
      Logger.info(`⏳ Память будет активирована при первом сообщении`);
      
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
      
      // Автоматически загружаем личность если она еще не загружена
      if (!this.responseEngine) {
        const personalityPath = 'chat/result_personality.json';
        try {
          await this.loadPersonality(personalityPath);
        } catch (error) {
          Logger.warn(`⚠️ Не удалось загрузить личность из ${personalityPath}: ${error}`);
          Logger.info('Гейсандр Кулович будет работать в fallback режиме');
        }
      }
      
      this.isRunning = true;
      
      // Инициализируем health monitor
      this.healthMonitor = new HealthMonitor(this.chatId || undefined);
      
      // Проводим начальную проверку здоровья
      try {
        const healthStatus = await this.healthMonitor.getHealthStatus();
        Logger.info(`🥰 Проверка здоровья: ${healthStatus.status.toUpperCase()}`);
        if (healthStatus.status !== 'healthy') {
          Logger.warn('⚠️ Обнаружены проблемы - запустите: bun run health-check');
        }
        this.lastHealthCheck = new Date();
      } catch (error) {
        Logger.warn('Ошибка при проверке здоровья:', error);
      }
      
      if (this.responseEngine) {
        Logger.info('🧠 Гейсандр Кулович вспомнил свой характер и готов к общению!');
        Logger.info(`🤖 AI режим: ${config.aiMode} (вероятность: ${(config.aiProbability * 100).toFixed(0)}%)`);
        Logger.info(`🖼️ Анализ изображений: ${this.imageAnalyzer?.isAvailable() ? this.imageAnalyzer.getModelInfo() : 'отключен'}`);
        Logger.info(`💾 База данных: ${config.databasePath} (память активируется при первом сообщении)`);
      } else {
        Logger.warn('⚠️ Гейсандр Кулович что-то подзабыл свои привычки (fallback режим)');
        Logger.info('Создайте файл личности командой: bun run patterns result_analysis.json');
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

  /**
   * Получает статус здоровья системы
   */
  public async getHealthStatus(): Promise<HealthStatus | null> {
    if (!this.healthMonitor) {
      return null;
    }
    
    try {
      const status = await this.healthMonitor.getHealthStatus();
      this.lastHealthCheck = new Date();
      return status;
    } catch (error) {
      Logger.error('Ошибка при получении статуса здоровья:', error);
      return null;
    }
  }

  /**
   * Быстрая проверка здоровья
   */
  public async quickHealthCheck(): Promise<{ status: string; message: string } | null> {
    if (!this.healthMonitor) {
      return null;
    }
    
    try {
      return await this.healthMonitor.quickHealthCheck();
    } catch (error) {
      Logger.error('Ошибка при быстрой проверке:', error);
      return { status: 'error', message: 'Ошибка проверки' };
    }
  }

  /**
   * Проверяет нужно ли обновить статус здоровья (каждые 30 минут)
   */
  private shouldUpdateHealthStatus(): boolean {
    if (!this.lastHealthCheck) return true;
    
    const thirtyMinutes = 30 * 60 * 1000;
    return (Date.now() - this.lastHealthCheck.getTime()) > thirtyMinutes;
  }

  /**
   * Принудительно инициализирует память для конкретного чата
   */
  public initializeMemoryForChat(chatId: string): void {
    if (this.responseEngine) {
      // Пересоздаем движок с правильным chatId
      this.chatId = chatId;
      // Здесь можно добавить логику переинициализации если нужно
      Logger.info(`Память инициализирована для чата: ${chatId}`);
    }
  }
}