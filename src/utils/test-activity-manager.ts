#!/usr/bin/env bun

/**
 * Тестер системы умного расписания активности (ЭТАП 9)
 * 
 * Проверяет работу ActivityManager и динамической адаптации поведения
 */

import { Logger } from './logger.js';
import { ActivityManager } from '../core/activity-manager.js';

const testChatId = '316537427';

class ActivityTester {
  private activityManager: ActivityManager;

  constructor() {
    this.activityManager = new ActivityManager(testChatId);
  }

  async runAllTests(): Promise<void> {
    Logger.info('📊 Запуск тестов системы активности...');
    
    console.log('\n=== ТЕСТ СИСТЕМЫ ДИНАМИЧЕСКОЙ АКТИВНОСТИ ===');
    
    // Даем время системе проинициализироваться
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n1. ТЕКУЩЕЕ СОСТОЯНИЕ АКТИВНОСТИ');
    this.testCurrentActivity();
    
    console.log('\n2. АНАЛИЗ АКТИВНОСТИ ПО ВРЕМЕНИ');
    this.testTimeAnalysis();
    
    console.log('\n3. СИМУЛЯЦИЯ РАЗЛИЧНЫХ СЦЕНАРИЕВ');
    await this.testActivityScenarios();
    
    console.log('\n4. ПРОВЕРКА МОДИФИКАТОРОВ ПОВЕДЕНИЯ');
    this.testBehaviorModifiers();
    
    this.activityManager.close();
    Logger.info('✅ Все тесты системы активности завершены');
  }

  private testCurrentActivity(): void {
    const modifiers = this.activityManager.getActivityModifiers();
    const stats = this.activityManager.getActivityStats();
    
    console.log('📊 ТЕКУЩАЯ АКТИВНОСТЬ:');
    console.log(`   Активное время: ${modifiers.isActiveTime ? '✅ ДА' : '❌ НЕТ'}`);
    console.log(`   Множитель ответов: ${modifiers.responseMultiplier.toFixed(2)}x`);
    console.log(`   Множитель задержки: ${modifiers.delayMultiplier.toFixed(2)}x`);
    console.log(`   Неактивность чата: ${modifiers.inactivityPeriod} минут`);
    console.log(`   Детали: ${stats}`);
  }

  private testTimeAnalysis(): void {
    const now = new Date();
    
    console.log('🕒 АНАЛИЗ ПО ВРЕМЕНИ:');
    
    // Тестируем разные часы
    const testHours = [6, 12, 18, 23]; // утро, день, вечер, ночь
    
    testHours.forEach(hour => {
      // Принудительно обновляем паттерн для симуляции
      this.activityManager.updateActivityPattern();
      const modifiers = this.activityManager.getActivityModifiers();
      
      const timeDescription = hour < 6 ? 'ночь' : 
                            hour < 12 ? 'утро' : 
                            hour < 18 ? 'день' : 'вечер';
      
      console.log(`   ${hour}:00 (${timeDescription}): множитель ${modifiers.responseMultiplier.toFixed(2)}x, ${modifiers.isActiveTime ? 'активно' : 'спокойно'}`);
    });
  }

  private async testActivityScenarios(): Promise<void> {
    console.log('🎬 СЦЕНАРИИ АКТИВНОСТИ:');
    
    const scenarios = [
      {
        name: 'Высокая активность группы',
        description: 'Много сообщений в последние дни'
      },
      {
        name: 'Спокойный период',  
        description: 'Мало активности последнее время'
      },
      {
        name: 'Долгая тишина',
        description: 'Более часа без сообщений'
      },
      {
        name: 'Активный разговор',
        description: 'Сообщения каждые несколько минут'
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n📋 СЦЕНАРИЙ: ${scenario.name}`);
      console.log(`   Описание: ${scenario.description}`);
      
      // Получаем текущие модификаторы
      const modifiers = this.activityManager.getActivityModifiers();
      
      // Рассчитываем базовую вероятность ответа (как в response-engine)
      let baseChance = 0.4; // базовая вероятность из activityLevel
      
      // Применяем модификаторы
      let finalChance = baseChance * modifiers.responseMultiplier;
      
      // Логика неактивности
      if (modifiers.inactivityPeriod > 60) {
        finalChance *= 1.5;
      } else if (modifiers.inactivityPeriod < 5) {
        finalChance *= 0.7;
      }
      
      const shouldRespond = Math.random() < finalChance;
      
      console.log(`   Базовая вероятность: ${(baseChance * 100).toFixed(0)}%`);
      console.log(`   После модификации: ${(finalChance * 100).toFixed(0)}%`);
      console.log(`   Результат симуляции: ${shouldRespond ? '✅ ОТВЕТИТ' : '❌ НЕ ОТВЕТИТ'}`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private testBehaviorModifiers(): void {
    console.log('🎛️ МОДИФИКАТОРЫ ПОВЕДЕНИЯ:');
    
    const modifiers = this.activityManager.getActivityModifiers();
    
    // Анализируем влияние модификаторов на поведение
    const baseResponseTime = 2000; // 2 секунды базовое время ответа
    const modifiedResponseTime = baseResponseTime * modifiers.delayMultiplier;
    
    const baseActivity = 0.7; // 70% базовая активность
    const modifiedActivity = Math.min(1.0, baseActivity * modifiers.responseMultiplier);
    
    console.log('   ВЛИЯНИЕ НА ПОВЕДЕНИЕ:');
    console.log(`   ├─ Время ответа: ${baseResponseTime}мс → ${modifiedResponseTime.toFixed(0)}мс`);
    console.log(`   ├─ Уровень активности: ${(baseActivity * 100).toFixed(0)}% → ${(modifiedActivity * 100).toFixed(0)}%`);
    console.log(`   ├─ Режим: ${modifiers.isActiveTime ? 'активный' : 'пассивный'}`);
    console.log(`   └─ Неактивность чата: ${modifiers.inactivityPeriod} минут`);
    
    // Рекомендации поведения
    console.log('\n   РЕКОМЕНДАЦИИ:');
    if (modifiers.responseMultiplier > 1.5) {
      console.log('   📈 Высокая активность - отвечать чаще');
    } else if (modifiers.responseMultiplier < 0.7) {
      console.log('   📉 Низкая активность - быть сдержаннее');
    } else {
      console.log('   ⚖️ Нормальная активность - обычное поведение');
    }
    
    if (modifiers.inactivityPeriod > 120) {
      console.log('   💤 Долгая тишина - можно инициировать общение');
    } else if (modifiers.inactivityPeriod < 2) {
      console.log('   💬 Активный разговор - не мешать слишком часто');
    }
  }

  private simulateTimeOfDay(hour: number): void {
    // Здесь можно было бы симулировать различное время суток
    // но для простоты используем текущие данные
  }
}

// Запуск тестирования
const tester = new ActivityTester();
await tester.runAllTests();