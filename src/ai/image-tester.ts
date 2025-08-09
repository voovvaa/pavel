import { ImageAnalyzer, ImageContext } from './image-analyzer.js';
import { BotPersonality } from '../core/types.js';
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Тестер анализа изображений для ЭТАПА 7
 */
export class ImageTester {
  private imageAnalyzer: ImageAnalyzer;

  constructor() {
    // Создаем минимальную личность для тестирования
    const testPersonality: BotPersonality = {
      patterns: [],
      responseStyle: {
        averageLength: 50,
        commonWords: ['норм', 'кек', 'лол'],
        commonEmojis: ['😂', '👍', '🤔'],
        formalityLevel: 0.3,
        activityLevel: 0.7
      },
      schedule: {
        activeHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
        activeDays: [1, 2, 3, 4, 5, 6, 7]
      }
    };

    this.imageAnalyzer = new ImageAnalyzer(testPersonality, true); // Отключаем rate limit для тестов
  }

  /**
   * Тестирует анализ тестового изображения
   */
  async testImageAnalysis(): Promise<void> {
    Logger.info('🧪 Начинаем тестирование анализа изображений...');

    if (!this.imageAnalyzer.isAvailable()) {
      Logger.error('❌ Анализатор изображений недоступен - проверьте OPENAI_API_KEY');
      return;
    }

    Logger.info(`📊 Модель для анализа: ${this.imageAnalyzer.getModelInfo()}`);

    // Ищем тестовые изображения в папке chat/files
    const testImagesPath = 'chat/files';
    
    try {
      const files = await fs.readdir(testImagesPath);
      const imageFiles = files.filter(file => 
        file.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) && 
        !file.includes('thumb')
      ).slice(0, 3); // Тестируем только первые 3 изображения

      if (imageFiles.length === 0) {
        Logger.warn('⚠️ Не найдено тестовых изображений в chat/files/');
        Logger.info('Создайте тестовое изображение или поместите его в chat/files/');
        return;
      }

      Logger.info(`🖼️ Найдено ${imageFiles.length} тестовых изображений`);

      for (const imageFile of imageFiles) {
        await this.testSingleImage(join(testImagesPath, imageFile), imageFile);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза между запросами
      }

    } catch (error) {
      Logger.error('Ошибка при чтении папки с изображениями:', error);
      
      // Fallback: тестируем с фиктивными данными
      Logger.info('🔄 Переходим к тестированию с мокап данными...');
      await this.testMockImageAnalysis();
    }
  }

  /**
   * Тестирует анализ одного изображения
   */
  private async testSingleImage(imagePath: string, fileName: string): Promise<void> {
    Logger.info(`\n📷 Тестируем изображение: ${fileName}`);
    
    try {
      const imageBuffer = await fs.readFile(imagePath);
      Logger.info(`📁 Размер файла: ${imageBuffer.length} байт`);

      const imageContext: ImageContext = {
        chatContext: [
          'Бодя: смотри что нашел',
          'Макс: о, интересно',
          'Саня: сейчас посмотрю'
        ],
        userName: 'TestUser',
        userProfile: undefined, // Тест без профиля
        personality: {} as BotPersonality
      };

      Logger.info('🔍 Начинаем анализ изображения...');
      const startTime = Date.now();
      
      const analysis = await this.imageAnalyzer.analyzeImage(imageBuffer, imageContext);
      
      const analysisTime = Date.now() - startTime;
      Logger.info(`⏱️ Время анализа: ${analysisTime}мс`);

      if (analysis) {
        Logger.info('✅ Анализ успешно завершен!');
        Logger.info('📋 Результаты анализа:');
        Logger.info(`   • Описание: ${analysis.description}`);
        Logger.info(`   • Тип: ${analysis.type}`);
        Logger.info(`   • Настроение: ${analysis.mood || 'не определено'}`);
        Logger.info(`   • Юмор: ${analysis.isHumorous ? 'да' : 'нет'}`);
        Logger.info(`   • Содержит текст: ${analysis.containsText ? 'да' : 'нет'}`);
        if (analysis.textContent) {
          Logger.info(`   • Текст: "${analysis.textContent}"`);
        }
        Logger.info(`   • Теги: [${analysis.tags.join(', ')}]`);

        // Тестируем генерацию ответа
        Logger.info('\n💬 Генерируем ответ Гейсандра...');
        const responseStartTime = Date.now();
        
        const response = await this.imageAnalyzer.generateImageResponse(analysis, imageContext);
        
        const responseTime = Date.now() - responseStartTime;
        Logger.info(`⏱️ Время генерации ответа: ${responseTime}мс`);

        if (response) {
          Logger.info(`✅ Ответ сгенерирован: "${response}"`);
        } else {
          Logger.warn('⚠️ Не удалось сгенерировать ответ');
        }

      } else {
        Logger.error('❌ Не удалось проанализировать изображение');
      }

    } catch (error) {
      Logger.error(`❌ Ошибка при тестировании ${fileName}:`, error);
    }
  }

  /**
   * Тестирует анализ с мокап данными (без реального изображения)
   */
  private async testMockImageAnalysis(): Promise<void> {
    Logger.info('\n🎭 Тест с мокап данными (симуляция анализа)...');
    
    // Создаем фиктивный результат анализа
    const mockAnalysis = {
      description: 'Тестовое изображение с мемом',
      content: 'Забавная картинка с текстом',
      type: 'meme' as const,
      mood: 'funny',
      containsText: true,
      textContent: 'Когда увидел новую фичу в проекте',
      isHumorous: true,
      tags: ['мем', 'программирование', 'юмор']
    };

    const imageContext: ImageContext = {
      chatContext: [
        'Бодя: кек, смешно',
        'Макс: ахаха, в точку',
        'Саня: именно так и было'
      ],
      userName: 'MockUser',
      userProfile: undefined,
      personality: {} as BotPersonality
    };

    Logger.info('📋 Мокап результат анализа:');
    Logger.info(`   • Описание: ${mockAnalysis.description}`);
    Logger.info(`   • Тип: ${mockAnalysis.type}`);
    Logger.info(`   • Юмор: ${mockAnalysis.isHumorous ? 'да' : 'нет'}`);
    Logger.info(`   • Теги: [${mockAnalysis.tags.join(', ')}]`);

    Logger.info('\n💬 Генерируем ответ для мокап данных...');
    try {
      const response = await this.imageAnalyzer.generateImageResponse(mockAnalysis, imageContext);
      
      if (response) {
        Logger.info(`✅ Ответ сгенерирован: "${response}"`);
      } else {
        Logger.warn('⚠️ Не удалось сгенерировать ответ для мокап данных');
      }
    } catch (error) {
      Logger.error('❌ Ошибка при генерации ответа для мокап данных:', error);
    }
  }

  /**
   * Показывает статистику и информацию о системе
   */
  showSystemInfo(): void {
    Logger.info('\n📊 Информация о системе анализа изображений:');
    Logger.info(`🔧 Анализатор доступен: ${this.imageAnalyzer.isAvailable() ? 'да' : 'нет'}`);
    Logger.info(`🤖 Модель: ${this.imageAnalyzer.getModelInfo()}`);
    
    if (!this.imageAnalyzer.isAvailable()) {
      Logger.info('\n❗ Для работы анализа изображений необходимо:');
      Logger.info('   1. Установить OPENAI_API_KEY в .env файл');
      Logger.info('   2. Убедиться что AI_MODE не равен "patterns_only"');
      Logger.info('   3. Проверить доступ к OpenAI API');
    }
  }
}

// Точка входа для тестирования
export async function runImageTests(): Promise<void> {
  const tester = new ImageTester();
  
  tester.showSystemInfo();
  await tester.testImageAnalysis();
  
  Logger.info('\n✅ Тестирование анализа изображений завершено!');
}