import OpenAI from "openai";
import { config } from "../core/config.js";
import { Logger } from "../utils/logger.js";
import { BotPersonality, UserProfile, ImageAnalysisResult } from "../core/types.js";

export interface ImageContext {
  chatContext: string[];
  userName: string;
  userProfile?: UserProfile;
  personality: BotPersonality;
  messageText?: string; // Текст сообщения (caption) если есть
}

export class ImageAnalyzer {
  private openai: OpenAI | null = null;
  private personality: BotPersonality;
  private isEnabled: boolean;
  private lastAnalysisTime: Map<string, number> = new Map(); // Для rate limiting
  private rateLimitDisabled: boolean = false; // Для тестирования

  constructor(personality: BotPersonality, disableRateLimit: boolean = false) {
    this.personality = personality;
    this.isEnabled = config.aiMode !== "patterns_only" && !!config.openaiApiKey;
    this.rateLimitDisabled = disableRateLimit;
    
    // Отключаем rate limiting для тестирования
    if (disableRateLimit) {
      this.lastAnalysisTime.clear();
    }

    if (this.isEnabled) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
      Logger.info(`🖼️ Анализатор изображений активирован (модель: ${this.getVisionModel()})`);
    } else {
      Logger.info("🖼️ Анализатор изображений отключен - нет API ключа");
    }
  }

  /**
   * Выбор лучшей модели для анализа изображений
   */
  private getVisionModel(): string {
    // GPT-5 модели с поддержкой изображений (если доступны)
    if (config.openaiModel.startsWith('gpt-5')) {
      return 'gpt-4o'; // Fallback на лучшую vision модель
    }
    
    // Лучшие vision модели на 2025
    return 'gpt-4o'; // Самая мощная vision модель
  }

  /**
   * Анализирует изображение из Telegram с оптимизацией расходов
   */
  async analyzeImage(
    imageBuffer: Buffer, 
    imageContext: ImageContext
  ): Promise<ImageAnalysisResult | null> {
    if (!this.isEnabled || !this.openai) {
      Logger.debug("Анализ изображений отключен");
      return null;
    }

    // ОПТИМИЗАЦИЯ 1: Rate limiting по пользователям (пропускаем в тестовом режиме)
    if (!this.rateLimitDisabled) {
      const rateLimitResult = this.checkRateLimit(imageContext.userName);
      if (!rateLimitResult.allowed) {
        Logger.debug(`⏰ Rate limit для ${imageContext.userName}: осталось ${rateLimitResult.timeLeft}с`);
        return null;
      }
    }

    // ОПТИМИЗАЦИЯ 2: Фильтрация по размеру файла
    if (imageBuffer.length < 10000) { // Менее 10KB - вероятно, мелкий стикер или превью
      Logger.debug(`📦 Изображение слишком маленькое (${imageBuffer.length} байт) - пропускаем анализ`);
      return null;
    }

    // ОПТИМИЗАЦИЯ 3: Лимит на большие файлы (экономим токены)
    if (imageBuffer.length > 5000000) { // Более 5MB
      Logger.debug(`📦 Изображение слишком большое (${imageBuffer.length} байт) - пропускаем анализ`);
      return null;
    }

    try {
      // Конвертируем Buffer в base64
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const analysisPrompt = this.buildAnalysisPrompt(imageContext);
      
      const response = await this.openai.chat.completions.create({
        model: this.getVisionModel(),
        messages: [
          {
            role: 'system',
            content: analysisPrompt.system
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: analysisPrompt.user
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high' // Максимальное качество анализа
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3 // Более точные результаты для анализа
      });

      const analysis = response.choices[0]?.message?.content;
      
      if (analysis) {
        const result = this.parseAnalysisResult(analysis);
        
        // Обновляем время последнего анализа для rate limiting (пропускаем в тестовом режиме)
        if (!this.rateLimitDisabled) {
          this.updateRateLimit(imageContext.userName);
        }
        
        Logger.info(`🖼️ Изображение проанализировано: ${result.type} - "${result.description}" (${imageBuffer.length} байт)`);
        return result;
      }
      
      return null;
      
    } catch (error: any) {
      Logger.error(`❌ Ошибка при анализе изображения: ${error?.message || 'Неизвестная ошибка'}`);
      if (error?.response?.status) {
        Logger.error(`HTTP статус: ${error.response.status}`);
      }
      return null;
    }
  }

  /**
   * Генерирует ответ на изображение в стиле Гейсандра
   */
  async generateImageResponse(
    analysis: ImageAnalysisResult,
    imageContext: ImageContext
  ): Promise<string | null> {
    if (!this.isEnabled || !this.openai || !analysis) {
      return null;
    }

    try {
      const responsePrompt = this.buildResponsePrompt(analysis, imageContext);
      
      const response = await this.openai.chat.completions.create({
        model: config.openaiModel || 'gpt-4o', // Fallback на gpt-4o для ответов
        messages: [
          {
            role: 'system',
            content: responsePrompt.system
          },
          {
            role: 'user',
            content: responsePrompt.user
          }
        ],
        max_tokens: 200,
        temperature: 0.8 // Более творческие ответы
      });

      const reply = response.choices[0]?.message?.content?.trim();
      
      if (reply) {
        // Очищаем от префиксов имени
        let cleanReply = reply;
        const namePatterns = [
          /^Гейсандр\s*Кулович\s*:\s*/i,
          /^Гейсандр\s*:\s*/i,
          /^Саня\s*:\s*/i,
        ];

        for (const pattern of namePatterns) {
          cleanReply = cleanReply.replace(pattern, "");
        }

        return cleanReply.trim();
      }
      
      return null;
      
    } catch (error) {
      Logger.error("Ошибка при генерации ответа на изображение:", error);
      return null;
    }
  }

  /**
   * Создает промпт для анализа изображения
   */
  private buildAnalysisPrompt(context: ImageContext): { system: string; user: string } {
    const recentMessages = context.chatContext.slice(-3).join('\n');
    
    let userInfo = "";
    if (context.userProfile) {
      const profile = context.userProfile;
      userInfo = `\nИнформация об отправителе ${context.userName}:
- Стиль общения: ${profile.communicationStyle.formalityLevel < 0.4 ? 'неформальный' : 'формальный'}
- Юмор: ${profile.socialBehavior.humor > 0.4 ? 'любит шутки' : 'серьезный'}
- Интересы: ${profile.interests.topTopics.slice(0, 3).map(t => t.topic).join(', ')}`;
    }

    const system = `Ты анализируешь изображения в Telegram чате как Саня (Гейсандр Кулович).
Твоя задача - понять что на картинке и определить тип контента.

АНАЛИЗИРУЙ:
1. Что изображено (коротко и ясно)
2. Тип: photo/meme/screenshot/document/other
3. Настроение: funny/serious/sad/angry/neutral
4. Есть ли текст на изображении
5. Это юмор/мем?
6. Тэги для поиска (3-5 слов)

КОНТЕКСТ ЧАТА:
${recentMessages}${userInfo}
${context.messageText ? `\nТЕКСТ С ИЗОБРАЖЕНИЕМ: "${context.messageText}"` : ''}

Отвечай в формате JSON:
{
  "description": "краткое описание",
  "content": "подробное содержание",
  "type": "тип",
  "mood": "настроение",
  "containsText": true/false,
  "textContent": "текст если есть",
  "isHumorous": true/false,
  "tags": ["тэг1", "тэг2", "тэг3"]
}`;

    let userPrompt = `Проанализируй это изображение от ${context.userName}`;
    if (context.messageText) {
      userPrompt += ` с подписью: "${context.messageText}"`;
    }
    userPrompt += ':';
    
    const user = userPrompt;

    return { system, user };
  }

  /**
   * Создает промпт для ответа на изображение
   */
  private buildResponsePrompt(
    analysis: ImageAnalysisResult,
    context: ImageContext
  ): { system: string; user: string } {
    const recentMessages = context.chatContext.slice(-3).join('\n');
    
    let styleAdaptation = "";
    if (context.userProfile) {
      const profile = context.userProfile;
      if (profile.communicationStyle.formalityLevel < 0.3) {
        styleAdaptation += "\nОтвечай неформально, дружески.";
      }
      if (profile.socialBehavior.humor > 0.4 && analysis.isHumorous) {
        styleAdaptation += "\nМожно пошутить в ответ - он оценит юмор.";
      }
    }

    let systemPrompt = `Ты Саня (Гейсандр Кулович) из чата. Пользователь ${context.userName} прислал изображение`;
    if (context.messageText) {
      systemPrompt += ` с подписью: "${context.messageText}"`;
    }
    systemPrompt += `.\n\nЧТО НА КАРТИНКЕ:\n${analysis.description}\n\nДЕТАЛИ:\n- Тип: ${analysis.type}\n- Настроение: ${analysis.mood || 'нейтральное'}\n- Юмор: ${analysis.isHumorous ? 'да' : 'нет'}\n- Теги: ${analysis.tags.join(', ')}`;
    
    if (analysis.textContent) {
      systemPrompt += `\n- Текст на изображении: "${analysis.textContent}"`;
    }
    
    systemPrompt += `\n\nКОНТЕКСТ ЧАТА:\n${recentMessages}${styleAdaptation}\n\nЗАДАЧА: Отреагируй на изображение как живой участник чата. \n- Будь естественным, не официальным\n- Можешь прокомментировать, пошутить, задать вопрос\n- Учитывай что изображено и настроение\n- Отвечай коротко (1-2 предложения)`;
    
    const system = systemPrompt;

    const user = `Отреагируй на это изображение от ${context.userName}.`;

    return { system, user };
  }

  /**
   * Парсит результат анализа из JSON ответа AI
   */
  private parseAnalysisResult(analysis: string): ImageAnalysisResult {
    try {
      let jsonString = analysis;
      
      // Извлекаем JSON из markdown блоков ```json ... ```
      const jsonMatch = analysis.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
      }
      
      // Пробуем распарсить JSON
      const parsed = JSON.parse(jsonString);
      
      return {
        description: parsed.description || 'Изображение без описания',
        content: parsed.content || parsed.description || 'Контент не определен',
        type: parsed.type || 'other',
        mood: parsed.mood,
        containsText: parsed.containsText || false,
        textContent: parsed.textContent,
        isHumorous: parsed.isHumorous || false,
        tags: parsed.tags || []
      };
    } catch (error) {
      Logger.warn("⚠️ Не удалось распарсить JSON анализа, используем текст как описание");
      
      // Fallback: используем весь текст как описание
      return {
        description: analysis.substring(0, 100) + '...',
        content: analysis,
        type: 'other',
        tags: [],
        isHumorous: analysis.toLowerCase().includes('юмор') || analysis.toLowerCase().includes('смешно')
      };
    }
  }

  /**
   * Проверяет доступность анализатора
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Проверяет rate limit для пользователя
   */
  private checkRateLimit(userName: string): { allowed: boolean; timeLeft: number } {
    const MIN_INTERVAL = 30000; // 30 секунд между анализами от одного пользователя
    const lastTime = this.lastAnalysisTime.get(userName) || 0;
    const now = Date.now();
    const timePassed = now - lastTime;
    
    if (timePassed < MIN_INTERVAL) {
      const timeLeft = Math.ceil((MIN_INTERVAL - timePassed) / 1000);
      return { allowed: false, timeLeft };
    }
    
    return { allowed: true, timeLeft: 0 };
  }

  /**
   * Обновляет время последнего анализа для пользователя
   */
  private updateRateLimit(userName: string): void {
    this.lastAnalysisTime.set(userName, Date.now());
    
    // Очистка старых записей (более часа назад)
    const oneHourAgo = Date.now() - 3600000;
    for (const [user, time] of this.lastAnalysisTime.entries()) {
      if (time < oneHourAgo) {
        this.lastAnalysisTime.delete(user);
      }
    }
  }

  /**
   * Возвращает информацию о модели
   */
  getModelInfo(): string {
    return this.isEnabled ? `${this.getVisionModel()} (Vision + Cost Optimization)` : "отключен";
  }

  /**
   * Возвращает статистику использования
   */
  getUsageStats(): { activeUsers: number; rateLimitedUsers: string[] } {
    const now = Date.now();
    const rateLimitedUsers: string[] = [];
    
    for (const [user, lastTime] of this.lastAnalysisTime.entries()) {
      if (now - lastTime < 30000) { // Еще в rate limit
        rateLimitedUsers.push(user);
      }
    }
    
    return {
      activeUsers: this.lastAnalysisTime.size,
      rateLimitedUsers
    };
  }
}