#!/usr/bin/env bun

/**
 * Тестирование эмоциональной адаптации в реальных сценариях (ЭТАП 8)
 * 
 * Проверяет как эмоциональная система влияет на поведение бота
 */

import { Logger } from './logger.js';
import { ResponseEngine } from '../ai/response-engine.js';
import { BotPersonality } from '../core/types.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { promises as fs } from 'fs';

const testChatId = '316537427';

class AdaptationTester {
  private responseEngine: ResponseEngine;
  private memoryManager: MemoryManager;
  private personality: BotPersonality;

  constructor() {
    this.personality = {
      patterns: [],
      responseStyle: {
        averageLength: 50,
        commonWords: [],
        commonEmojis: [],
        formalityLevel: 0.3,
        activityLevel: 0.7
      },
      schedule: {
        activeHours: Array.from({length: 24}, (_, i) => i),
        activeDays: [0, 1, 2, 3, 4, 5, 6]
      }
    };
    
    this.responseEngine = new ResponseEngine(this.personality, testChatId);
    this.memoryManager = new MemoryManager(testChatId);
  }

  async runAdaptationTests(): Promise<void> {
    Logger.info('🎭 Тестирование эмоциональной адаптации...');
    
    console.log('\n=== ТЕСТ АДАПТАЦИИ К ЭМОЦИОНАЛЬНЫМ СЦЕНАРИЯМ ===');
    
    const scenarios = [
      {
        name: 'Грустный пользователь',
        author: 'ГрустныйЮзер',
        messages: [
          'Мне сегодня очень плохо...',
          'Ничего не получается, все против меня',
          'Кажется, никому нет до меня дела'
        ]
      },
      {
        name: 'Злой пользователь',
        author: 'ЗлойЮзер',
        messages: [
          'Блять, меня все достало!',
          'Эти придурки опять все испортили!',
          'Хочется всех послать нахуй!'
        ]
      },
      {
        name: 'Веселый пользователь',
        author: 'ВеселыйЮзер',
        messages: [
          'Ахахаха, сегодня такой прикольный день! 😂',
          'Давайте устроим вечеринку! 🎉',
          'Жизнь прекрасна, друзья! ✨'
        ]
      },
      {
        name: 'Конфликт между пользователями',
        author: 'КонфликтныйЮзер',
        messages: [
          'Иван, ты несешь полную чушь!',
          'Как можно быть таким тупым?',
          'Лучше бы молчал, чем такую ерунду писать'
        ]
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n🎬 СЦЕНАРИЙ: ${scenario.name}`);
      console.log('─'.repeat(50));
      
      for (let i = 0; i < scenario.messages.length; i++) {
        const message = scenario.messages[i];
        console.log(`\n💬 ${scenario.author}: "${message}"`);
        
        // Обновляем контекст
        this.responseEngine.updateContext(scenario.author, message);
        
        // Проверяем должен ли бот ответить
        const shouldRespond = this.responseEngine.shouldRespond(message, scenario.author);
        console.log(`🤔 Должен ли ответить: ${shouldRespond ? '✅ ДА' : '❌ НЕТ'}`);
        
        if (shouldRespond) {
          try {
            // Генерируем ответ
            const response = await this.responseEngine.generateResponse(message, scenario.author);
            
            if (response) {
              console.log(`🤖 Гейсандр: "${response}"`);
              
              // Анализируем характеристики ответа
              this.analyzeResponse(response, scenario.name);
            } else {
              console.log('🤖 Гейсандр: [не смог сгенерировать ответ]');
            }
          } catch (error) {
            console.error('❌ Ошибка генерации ответа:', error);
          }
        }
        
        // Пауза между сообщениями
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('\n=== АНАЛИЗ ЭМОЦИОНАЛЬНЫХ ПРОФИЛЕЙ ===');
    await this.analyzeEmotionalProfiles();
    
    this.memoryManager.close();
    Logger.info('✅ Тесты адаптации завершены');
  }

  private analyzeResponse(response: string, scenarioName: string): void {
    const length = response.length;
    const hasEmojis = /[\u{1F600}-\u{1F64F}]|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F700}-\u{1F77F}|\u{1F780}-\u{1F7FF}|\u{1F800}-\u{1F8FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}/u.test(response);
    const hasSwearing = /блять|нахуй|пиздец|дерьмо/i.test(response);
    const isSupporting = /поддержива|понима|сочувств|помог|все будет хорошо/i.test(response);
    const isCalming = /успокой|не переживай|расслабь|все ок/i.test(response);
    const isPlayful = /ахах|лол|кек|прикол|весел/i.test(response);
    const isEmpathetic = /чувству|понима|сочувств|пережива/i.test(response);
    
    console.log('📊 Характеристики ответа:');
    console.log(`   Длина: ${length} символов`);
    console.log(`   Эмодзи: ${hasEmojis ? '✅' : '❌'}`);
    console.log(`   Мат: ${hasSwearing ? '⚠️' : '✅'}`);
    console.log(`   Поддержка: ${isSupporting ? '✅' : '❌'}`);
    console.log(`   Успокаивание: ${isCalming ? '✅' : '❌'}`);
    console.log(`   Игривость: ${isPlayful ? '✅' : '❌'}`);
    console.log(`   Эмпатия: ${isEmpathetic ? '✅' : '❌'}`);
  }

  private async analyzeEmotionalProfiles(): Promise<void> {
    try {
      const memoryContext = await this.memoryManager.buildMemoryContext("анализ профилей", "system");
      
      console.log(`\n👥 Эмоциональные профили пользователей (${memoryContext.userRelationships.size}):`);
      
      for (const [userName, relationship] of memoryContext.userRelationships) {
        if (relationship.emotionalProfile) {
          console.log(`\n🎭 ${userName}:`);
          console.log(`   📊 Темперамент: ${relationship.emotionalProfile.temperament}`);
          console.log(`   🎭 Роль: ${relationship.emotionalProfile.socialRole}`);
          console.log(`   💫 Эмоциональность: ${(relationship.emotionalProfile.expressiveness * 100).toFixed(0)}%`);
          console.log(`   🎯 Стабильность: ${(relationship.emotionalProfile.stability * 100).toFixed(0)}%`);
          
          if (relationship.emotionalProfile.typicalEmotions.length > 0) {
            console.log(`   😊 Частые эмоции: ${relationship.emotionalProfile.typicalEmotions.join(', ')}`);
          }
          
          if (relationship.emotionalProfile.recentMoods.length > 0) {
            const recentMood = relationship.emotionalProfile.recentMoods[0];
            console.log(`   📈 Последнее настроение: ${recentMood.dominantEmotion} (${(recentMood.intensity * 100).toFixed(0)}%)`);
          }
        }
      }
      
      // Анализ группового состояния
      if (memoryContext.groupEmotionalState) {
        const groupState = memoryContext.groupEmotionalState;
        console.log('\n🌐 ГРУППОВОЕ СОСТОЯНИЕ:');
        console.log(`   Настроение: ${groupState.groupMood.dominant} (${(groupState.groupMood.intensity * 100).toFixed(0)}%)`);
        console.log(`   Гармония: ${(groupState.dynamics.harmony * 100).toFixed(0)}%`);
        console.log(`   Напряженность: ${(groupState.dynamics.tension * 100).toFixed(0)}%`);
        console.log(`   Энергия: ${(groupState.dynamics.energy * 100).toFixed(0)}%`);
        
        if (groupState.conflicts.length > 0) {
          console.log(`   ⚔️ Конфликты: ${groupState.conflicts.length}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Ошибка анализа профилей:', error);
    }
  }
}

// Запуск тестирования
const tester = new AdaptationTester();
await tester.runAdaptationTests();