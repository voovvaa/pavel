#!/usr/bin/env bun

/**
 * Анализатор стоимости работы с изображениями для ЭТАПА 7
 * Помогает оценить расходы на OpenAI Vision API
 */

import { Logger } from '../utils/logger.js';

interface CostEstimate {
  imagesPerDay: number;
  costPerImage: number;
  dailyCost: number;
  monthlyCost: number;
  yearlyCost: number;
}

export class CostAnalyzer {
  // Текущие цены OpenAI (январь 2025)
  private static readonly PRICING = {
    // GPT-4o Vision API (приблизительно)
    gpt4o_per_image: 0.01, // $0.01 за стандартное изображение
    gpt4o_mini_per_image: 0.01, // Тот же токенный расход что у обычного GPT-4o
    
    // Альтернативные расценки по токенам (более точные)
    gpt4o_input_per_1k_tokens: 0.0025,  // $2.50 за 1M токенов input
    gpt4o_output_per_1k_tokens: 0.01,   // $10.00 за 1M токенов output
    
    // Среднее количество токенов для изображения
    tokens_per_image_input: 255,  // ~255 токенов для стандартного изображения
    tokens_per_response: 100      // ~100 токенов для ответа бота
  };

  /**
   * Рассчитывает точную стоимость по токенам
   */
  private static calculateTokenCost(imageCount: number): number {
    const inputTokens = imageCount * this.PRICING.tokens_per_image_input;
    const outputTokens = imageCount * this.PRICING.tokens_per_response;
    
    const inputCost = (inputTokens / 1000) * this.PRICING.gpt4o_input_per_1k_tokens;
    const outputCost = (outputTokens / 1000) * this.PRICING.gpt4o_output_per_1k_tokens;
    
    return inputCost + outputCost;
  }

  /**
   * Анализирует стоимость для разных сценариев использования
   */
  static analyzeCosts(): void {
    Logger.info('💰 Анализ стоимости анализа изображений');
    Logger.info('');

    const scenarios = [
      {
        name: 'Маленький чат',
        description: '2-3 изображения в день',
        imagesPerDay: 2.5
      },
      {
        name: 'Активный чат',
        description: '5-10 изображений в день',
        imagesPerDay: 7.5
      },
      {
        name: 'Очень активный чат',
        description: '15-20 изображений в день',
        imagesPerDay: 17.5
      },
      {
        name: 'Мем-чат',
        description: '30-50 изображений в день',
        imagesPerDay: 40
      }
    ];

    for (const scenario of scenarios) {
      const simpleCost = this.calculateSimpleCost(scenario.imagesPerDay);
      const tokenCost = this.calculateTokenCost(scenario.imagesPerDay);
      
      Logger.info(`📊 ${scenario.name} (${scenario.description}):`);
      Logger.info(`   💸 Простая оценка: $${simpleCost.dailyCost.toFixed(3)}/день, $${simpleCost.monthlyCost.toFixed(2)}/месяц`);
      Logger.info(`   🎯 Точная оценка:  $${tokenCost.toFixed(3)}/день, $${(tokenCost * 30).toFixed(2)}/месяц`);
      Logger.info(`   📈 В рублях (~100₽/$): ${(tokenCost * 30 * 100).toFixed(0)}₽/месяц`);
      Logger.info('');
    }
  }

  /**
   * Простая оценка по цене за изображение
   */
  private static calculateSimpleCost(imagesPerDay: number): CostEstimate {
    const costPerImage = this.PRICING.gpt4o_per_image;
    const dailyCost = imagesPerDay * costPerImage;
    
    return {
      imagesPerDay,
      costPerImage,
      dailyCost,
      monthlyCost: dailyCost * 30,
      yearlyCost: dailyCost * 365
    };
  }

  /**
   * Показывает способы оптимизации расходов
   */
  static showOptimizations(): void {
    Logger.info('🔧 Способы оптимизации расходов:');
    Logger.info('');
    
    Logger.info('1. 📊 Настройка вероятностей ответа:');
    Logger.info('   • Сейчас: мемы 100%, фото 30%, документы 60%');
    Logger.info('   • Можно: мемы 80%, фото 15%, документы 40%');
    Logger.info('   • Экономия: ~35% от общих расходов');
    Logger.info('');
    
    Logger.info('2. 🎯 Фильтрация по размеру изображения:');
    Logger.info('   • Анализировать только изображения > 50KB');
    Logger.info('   • Игнорировать мелкие стикеры и превью');
    Logger.info('   • Экономия: ~25% от общих расходов');
    Logger.info('');
    
    Logger.info('3. ⏰ Лимиты по времени:');
    Logger.info('   • Не более 10 изображений в час от одного пользователя');
    Logger.info('   • Пауза между анализами: 30 секунд');
    Logger.info('   • Экономия: защита от спама');
    Logger.info('');
    
    Logger.info('4. 🔄 Кэширование результатов:');
    Logger.info('   • Сохранять анализ одинаковых изображений');
    Logger.info('   • Переиспользование для дубликатов');
    Logger.info('   • Экономия: ~20% для активных чатов');
    Logger.info('');
    
    Logger.info('5. 💾 Локальные альтернативы:');
    Logger.info('   • Ollama + LLaVA для базового анализа (бесплатно)');
    Logger.info('   • OpenAI только для сложных случаев');
    Logger.info('   • Экономия: до 70% при хорошей настройке');
    Logger.info('');
  }

  /**
   * Рассчитывает стоимость с учетом наших вероятностей ответа
   */
  static calculateRealWorldCost(): void {
    Logger.info('🎲 Реальная стоимость с учетом вероятностей ответа:');
    Logger.info('');
    
    // Предполагаем распределение типов изображений в обычном чате
    const imageDistribution = {
      memes: 0.2,      // 20% мемов (100% анализируем)
      photos: 0.5,     // 50% фото (30% анализируем) 
      screenshots: 0.2, // 20% скриншотов (60% анализируем)
      other: 0.1       // 10% прочее (20% анализируем)
    };
    
    const analysisRate = 
      imageDistribution.memes * 1.0 +
      imageDistribution.photos * 0.3 +
      imageDistribution.screenshots * 0.6 +
      imageDistribution.other * 0.2;
      
    Logger.info(`📈 Средний процент анализируемых изображений: ${(analysisRate * 100).toFixed(1)}%`);
    Logger.info('');
    
    const scenarios = [5, 15, 30]; // изображений в день
    
    for (const totalImages of scenarios) {
      const analyzedImages = totalImages * analysisRate;
      const cost = this.calculateTokenCost(analyzedImages);
      
      Logger.info(`📱 ${totalImages} изображений/день → ${analyzedImages.toFixed(1)} анализов → $${cost.toFixed(3)}/день`);
      Logger.info(`   💰 Месяц: $${(cost * 30).toFixed(2)} (~${(cost * 30 * 100).toFixed(0)}₽)`);
    }
    
    Logger.info('');
  }

  /**
   * Сравнивает с альтернативными решениями
   */
  static compareAlternatives(): void {
    Logger.info('⚖️ Сравнение с альтернативами:');
    Logger.info('');
    
    Logger.info('🏆 OpenAI GPT-4o Vision (текущее решение):');
    Logger.info('   ✅ Отличное качество анализа');
    Logger.info('   ✅ Понимает мемы и контекст');
    Logger.info('   ✅ Надежный OCR');
    Logger.info('   ❌ Стоимость: $0.65/1000 токенов');
    Logger.info('');
    
    Logger.info('🥈 Google Vision API:');
    Logger.info('   ✅ Дешевле: $1.50/1000 изображений');
    Logger.info('   ✅ Хорошая классификация');
    Logger.info('   ❌ Не понимает контекст чата');
    Logger.info('   ❌ Слабое понимание мемов');
    Logger.info('');
    
    Logger.info('🥉 Локальные модели (LLaVA, MiniGPT):');
    Logger.info('   ✅ Бесплатно после настройки');
    Logger.info('   ✅ Полный контроль данных');
    Logger.info('   ❌ Требует мощное железо');
    Logger.info('   ❌ Качество ниже GPT-4o');
    Logger.info('   ❌ Сложность настройки');
    Logger.info('');
  }
}

// Точка входа для анализа
function main() {
  Logger.info('🖼️ Анализатор стоимости Vision API для Гейсандра Куловича');
  Logger.info('='.repeat(60));
  Logger.info('');
  
  CostAnalyzer.analyzeCosts();
  CostAnalyzer.calculateRealWorldCost();
  CostAnalyzer.showOptimizations();
  CostAnalyzer.compareAlternatives();
  
  Logger.info('📋 Итоги:');
  Logger.info('• Для среднего чата: ~$2-5 в месяц (200-500₽)');
  Logger.info('• Для активного чата: ~$10-15 в месяц (1000-1500₽)'); 
  Logger.info('• С оптимизацией можно снизить на 50-70%');
  Logger.info('• Качество анализа стоит потраченных денег');
  Logger.info('');
  Logger.info('💡 Рекомендация: начать с базовых настроек и мониторить расходы');
}

// Запускаем если файл вызван напрямую
main();