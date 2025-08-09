import { ResponseEngine } from './response-engine.js';
import { UserProfiler } from '../analysis/user-profiler.js';
import { Logger } from '../utils/logger.js';
import { validateConfig } from '../core/config.js';
import { ModelSelector } from './model-selector.js';
import { promises as fs } from 'fs';

async function main() {
  try {
    // Сначала выбираем модель если не настроена
    const modelSelector = new ModelSelector();
    await modelSelector.ensureModelConfigured();
    
    validateConfig();
    
    const personalityPath = 'chat/result_personality.json';
    const chatId = '316537427';
    
    try {
      await fs.access(personalityPath);
    } catch {
      Logger.error(`Файл личности не найден: ${personalityPath}`);
      Logger.error('Создайте личность командой: bun run patterns result_analysis.json');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎭 ТЕСТИРОВАНИЕ АДАПТИВНЫХ ОТВЕТОВ');
    console.log('='.repeat(70));
    
    // Загружаем личность и создаем движок ответов
    const personalityData = JSON.parse(await fs.readFile(personalityPath, 'utf-8'));
    const responseEngine = new ResponseEngine(personalityData, chatId);
    
    // Инициализируем профайлер
    const profiler = new UserProfiler(chatId);
    
    // Получаем топ-3 пользователей для тестирования
    const profiles = await profiler.analyzeAllUsers();
    const topUsers = profiles
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 3);
    
    console.log(`\n📊 Найдено ${profiles.length} профилей, тестируем с топ-3 пользователями:\n`);
    
    // Тестовые сообщения
    const testMessages = [
      'Привет, как дела?',
      'Что думаешь про новости?', 
      'Расскажи анекдот',
      'Как прошел день?'
    ];
    
    for (let i = 0; i < Math.min(topUsers.length, 3); i++) {
      const profile = topUsers[i];
      const rank = ['🥇', '🥈', '🥉'][i];
      
      console.log(`${rank} ${profile.userName}:`);
      console.log(`├─ Стиль: формальность ${(profile.communicationStyle.formalityLevel * 100).toFixed(0)}%, эмоциональность ${(profile.communicationStyle.emotionalExpression * 100).toFixed(0)}%`);
      console.log(`├─ Поведение: юмор ${(profile.socialBehavior.humor * 100).toFixed(0)}%, поддержка ${(profile.socialBehavior.supportiveness * 100).toFixed(0)}%`);
      console.log(`└─ Интересы: ${profile.interests.topTopics.slice(0, 2).map(t => t.topic).join(', ')}`);
      
      // Тестируем 2 сообщения для этого пользователя
      for (let j = 0; j < 2; j++) {
        const message = testMessages[j];
        console.log(`\n  👤 ${profile.userName}: ${message}`);
        console.log(`  🤖 Гейсандр думает...`);
        
        try {
          const response = await responseEngine.generateResponse(message, profile.userName, Date.now());
          
          if (response) {
            console.log(`  🎭 Гейсандр: ${response}`);
          } else {
            console.log(`  🤐 Гейсандр промолчал`);
          }
        } catch (error) {
          console.log(`  ❌ Ошибка: ${error}`);
        }
        
        // Пауза между тестами
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('');
    }
    
    console.log('='.repeat(70));
    console.log('📈 АНАЛИЗ АДАПТАЦИИ:');
    console.log('');
    console.log('Ожидаемые различия в ответах:');
    console.log('├─ Формальные пользователи → более вежливые ответы');
    console.log('├─ Эмоциональные пользователи → более экспрессивные ответы');
    console.log('├─ Юморные пользователи → больше шуток и смайлов');
    console.log('├─ Поддерживающие пользователи → отклик на их готовность помочь');
    console.log('└─ Интересы пользователей → упоминание релевантных тем');
    console.log('');
    console.log('='.repeat(70));
    console.log('✅ Тестирование адаптивных ответов завершено!');
    console.log('='.repeat(70) + '\n');
    
    profiler.close();
    responseEngine.close();
    
  } catch (error) {
    Logger.error('Ошибка тестирования адаптивных ответов:', error);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}