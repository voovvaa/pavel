#!/usr/bin/env bun

/**
 * Тестирование эмоциональной системы (ЭТАП 8)
 * 
 * Проверяет работу EmotionAnalyzer и EmotionalAdapter
 */

import { Logger } from './logger.js';
import { EmotionAnalyzer } from '../ai/emotion-analyzer.js';
import { EmotionalAdapter } from '../ai/emotional-adapter.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { MemoryEntry } from '../core/types.js';

const testChatId = '316537427';

class EmotionalTester {
  private analyzer: EmotionAnalyzer;
  private adapter: EmotionalAdapter;
  private memoryManager: MemoryManager;

  constructor() {
    this.analyzer = new EmotionAnalyzer();
    this.adapter = new EmotionalAdapter();
    this.memoryManager = new MemoryManager(testChatId);
  }

  async runAllTests(): Promise<void> {
    Logger.info('🎭 Запуск тестов эмоциональной системы...');
    
    console.log('\n1. ТЕСТ АНАЛИЗА ЭМОЦИЙ В СООБЩЕНИЯХ');
    this.testEmotionAnalysis();
    
    console.log('\n2. ТЕСТ ПОСТРОЕНИЯ ЭМОЦИОНАЛЬНЫХ ПРОФИЛЕЙ');
    await this.testEmotionalProfiles();
    
    console.log('\n3. ТЕСТ АДАПТАЦИИ ПОВЕДЕНИЯ');
    await this.testEmotionalAdaptation();
    
    console.log('\n4. ТЕСТ ГРУППОВОГО АНАЛИЗА');
    await this.testGroupEmotionalState();
    
    this.memoryManager.close();
    Logger.info('✅ Все тесты эмоциональной системы завершены');
  }

  private testEmotionAnalysis(): void {
    const testMessages = [
      { text: 'Ахахаха, это просто убойно! 😂😂😂', author: 'TestUser1', expected: 'joy' },
      { text: 'Блять, меня это просто бесит!!! 😡', author: 'TestUser2', expected: 'anger' },
      { text: 'Мне сегодня очень грустно... 😢', author: 'TestUser3', expected: 'sadness' },
      { text: 'Да не знаю, пофиг как-то', author: 'TestUser4', expected: 'boredom' },
      { text: 'ВАУ! Это невероятно интересно!!!', author: 'TestUser5', expected: 'surprise' },
      { text: 'Ага, конечно, очень "умно" сказано', author: 'TestUser6', expected: 'sarcastic' },
      { text: 'Поддерживаю тебя! Все будет хорошо 🤗', author: 'TestUser7', expected: 'supportive' }
    ];

    testMessages.forEach(msg => {
      const analysis = this.analyzer.analyzeMessageEmotion(msg.text, msg.author);
      
      console.log(`📝 "${msg.text.substring(0, 30)}..."`);
      console.log(`   Ожидаемая эмоция: ${msg.expected}`);
      console.log(`   Найденная эмоция: ${analysis.dominant}`);
      console.log(`   Интенсивность: ${(analysis.intensity * 100).toFixed(0)}%`);
      console.log(`   Позитивность: ${analysis.valence > 0 ? '+' : ''}${analysis.valence.toFixed(2)}`);
      console.log(`   Уверенность: ${(analysis.confidence * 100).toFixed(0)}%`);
      
      const isCorrect = analysis.dominant === msg.expected || 
                       (msg.expected === 'boredom' && analysis.dominant === 'neutral');
      console.log(`   Результат: ${isCorrect ? '✅' : '❌'}\n`);
    });
  }

  private async testEmotionalProfiles(): Promise<void> {
    try {
      // Получаем историю сообщений из базы
      const memoryContext = await this.memoryManager.buildMemoryContext("тест профилей", "system");
      
      if (memoryContext.userRelationships.size === 0) {
        console.log('⚠️ Нет данных о пользователях для тестирования профилей');
        return;
      }

      console.log(`👥 Найдено пользователей: ${memoryContext.userRelationships.size}`);
      
      for (const [userName, relationship] of memoryContext.userRelationships) {
        if (relationship.emotionalProfile) {
          console.log(`\n👤 ${userName}:`);
          console.log(`   Темперамент: ${relationship.emotionalProfile.temperament}`);
          console.log(`   Социальная роль: ${relationship.emotionalProfile.socialRole}`);
          console.log(`   Эмоциональность: ${(relationship.emotionalProfile.expressiveness * 100).toFixed(0)}%`);
          console.log(`   Стабильность: ${(relationship.emotionalProfile.stability * 100).toFixed(0)}%`);
          console.log(`   Типичные эмоции: ${relationship.emotionalProfile.typicalEmotions.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка при тестировании профилей:', error);
    }
  }

  private async testEmotionalAdaptation(): Promise<void> {
    const testScenarios = [
      {
        user: 'TestAngryUser',
        message: 'Все плохо, меня бесит эта ситуация!',
        description: 'Злой пользователь'
      },
      {
        user: 'TestSadUser',
        message: 'Мне очень грустно, ничего не получается...',
        description: 'Грустный пользователь'
      },
      {
        user: 'TestHappyUser',
        message: 'Ахаха, классно! Давайте веселиться! 🎉',
        description: 'Веселый пользователь'
      }
    ];

    for (const scenario of testScenarios) {
      try {
        // Создаем простой контекст памяти для теста
        const mockMemoryContext = {
          recentMessages: [],
          relevantHistory: [],
          conversationSummaries: [],
          userRelationships: new Map(),
          activeTopics: [],
          currentMood: 'neutral'
        };

        const adaptation = this.adapter.adaptToEmotionalState(
          scenario.user,
          scenario.message,
          mockMemoryContext
        );

        console.log(`\n🎭 ${scenario.description}: "${scenario.message}"`);
        console.log(`   Тон ответа: ${adaptation.responseStyle.tone}`);
        console.log(`   Эмпатия: ${(adaptation.responseStyle.empathy * 100).toFixed(0)}%`);
        console.log(`   Энергия: ${(adaptation.responseStyle.energy * 100).toFixed(0)}%`);
        console.log(`   Юмор: ${(adaptation.responseStyle.humor * 100).toFixed(0)}%`);
        console.log(`   Модификатор ответа: ${adaptation.responseModifier.toFixed(2)}x`);
        
        const strategies = Object.entries(adaptation.strategies)
          .filter(([_, value]) => value)
          .map(([key, _]) => key);
        if (strategies.length > 0) {
          console.log(`   Стратегии: ${strategies.join(', ')}`);
        }
        
        if (adaptation.promptAdjustments.behaviorInstructions) {
          console.log(`   Инструкции: ${adaptation.promptAdjustments.behaviorInstructions}`);
        }
      } catch (error) {
        console.error(`❌ Ошибка при тестировании адаптации для ${scenario.user}:`, error);
      }
    }
  }

  private async testGroupEmotionalState(): Promise<void> {
    try {
      // Получаем реальный контекст памяти
      const memoryContext = await this.memoryManager.buildMemoryContext("тест группового анализа", "system");
      
      if (!memoryContext.groupEmotionalState) {
        console.log('⚠️ Нет данных о групповом эмоциональном состоянии');
        return;
      }

      const groupState = memoryContext.groupEmotionalState;
      
      console.log('\n🏁 ГРУППОВОЕ ЭМОЦИОНАЛЬНОЕ СОСТОЯНИЕ:');
      console.log(`   Общее настроение: ${groupState.groupMood.dominant}`);
      console.log(`   Интенсивность: ${(groupState.groupMood.intensity * 100).toFixed(0)}%`);
      console.log(`   Стабильность: ${(groupState.groupMood.stability * 100).toFixed(0)}%`);
      
      console.log('\n🔄 СОЦИАЛЬНАЯ ДИНАМИКА:');
      console.log(`   Гармония: ${(groupState.dynamics.harmony * 100).toFixed(0)}%`);
      console.log(`   Напряженность: ${(groupState.dynamics.tension * 100).toFixed(0)}%`);
      console.log(`   Энергия: ${(groupState.dynamics.energy * 100).toFixed(0)}%`);
      console.log(`   Вовлеченность: ${(groupState.dynamics.engagement * 100).toFixed(0)}%`);
      
      if (groupState.emotionalTopics.length > 0) {
        console.log('\n💭 ЭМОЦИОНАЛЬНЫЕ ТЕМЫ:');
        groupState.emotionalTopics.forEach(topic => {
          console.log(`   ${topic.topic}: ${topic.associatedEmotion} (${topic.participants.length} участников)`);
        });
      }
      
      if (groupState.conflicts.length > 0) {
        console.log('\n⚔️ КОНФЛИКТЫ:');
        groupState.conflicts.forEach(conflict => {
          console.log(`   ${conflict.participants.join(' vs ')}: ${conflict.status} (интенсивность: ${(conflict.intensity * 100).toFixed(0)}%)`);
        });
      }
    } catch (error) {
      console.error('❌ Ошибка при анализе группового состояния:', error);
    }
  }
}

// Запуск тестов
const tester = new EmotionalTester();
await tester.runAllTests();