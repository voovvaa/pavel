import { ResponseEngine } from './response-engine.js';
import { UserProfiler } from '../analysis/user-profiler.js';
import { Logger } from '../utils/logger.js';
import { validateConfig } from '../core/config.js';
import { promises as fs } from 'fs';

async function main() {
  try {
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

    console.log('\n' + '='.repeat(80));
    console.log('🆚 СРАВНЕНИЕ МОДЕЛЕЙ: GPT-5 NANO vs CHAT-LATEST');
    console.log('='.repeat(80));
    
    // Загружаем личность
    const personalityData = JSON.parse(await fs.readFile(personalityPath, 'utf-8'));
    
    // Инициализируем профайлер
    const profiler = new UserProfiler(chatId);
    
    // Получаем топ пользователя для тестирования
    const profiles = await profiler.analyzeAllUsers();
    const topUser = profiles.sort((a, b) => b.messageCount - a.messageCount)[0];
    
    console.log(`\n👤 Тестируем с пользователем: ${topUser.userName}`);
    console.log(`├─ Формальность: ${(topUser.communicationStyle.formalityLevel * 100).toFixed(0)}%`);
    console.log(`├─ Эмоциональность: ${(topUser.communicationStyle.emotionalExpression * 100).toFixed(0)}%`);
    console.log(`├─ Юмор: ${(topUser.socialBehavior.humor * 100).toFixed(0)}%`);
    console.log(`└─ Интересы: ${topUser.interests.topTopics.slice(0, 2).map(t => t.topic).join(', ')}\n`);
    
    // Тестовые сообщения
    const testMessages = [
      'Привет, как дела?',
      'Что думаешь про новые технологии?', 
      'Расскажи что-нибудь интересное',
      'Как прошел день?'
    ];
    
    // Модели для тестирования
    const models = [
      { 
        name: 'GPT-5 Nano', 
        value: 'gpt-5-nano',
        description: 'Быстрая и экономичная' 
      },
      { 
        name: 'GPT-5 Chat Latest', 
        value: 'gpt-5-chat-latest',
        description: 'Самая умная без reasoning токенов' 
      }
    ];
    
    for (const message of testMessages) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`💬 "${message}"`);
      console.log('─'.repeat(60));
      
      for (const model of models) {
        console.log(`\n🤖 ${model.name} (${model.description}):`);
        
        try {
          // Временно меняем модель в переменной окружения
          const originalModel = process.env.OPENAI_MODEL;
          process.env.OPENAI_MODEL = model.value;
          
          // Обновляем config и принудительно включаем AI режим
          const { config } = await import('../core/config.js');
          (config as any).openaiModel = model.value;
          (config as any).aiMode = 'ai_only'; // Принудительно только AI
          (config as any).aiProbability = 1.0; // 100% AI
          
          // Создаем новый движок ответов с обновленной моделью
          const responseEngine = new ResponseEngine(personalityData, chatId);
          
          console.log(`   🔄 Переключились на ${model.value}...`);
          
          const startTime = Date.now();
          const response = await responseEngine.generateResponse(message, topUser.userName, Date.now());
          const endTime = Date.now();
          
          if (response) {
            console.log(`   💭 Ответ: "${response}"`);
            console.log(`   ⏱️  Время: ${endTime - startTime}ms`);
            console.log(`   📏 Длина: ${response.length} символов`);
          } else {
            console.log(`   🤐 Не ответил`);
          }
          
          responseEngine.close();
          
          // Восстанавливаем оригинальную модель
          process.env.OPENAI_MODEL = originalModel;
          
        } catch (error) {
          console.log(`   ❌ Ошибка: ${error}`);
        }
        
        // Пауза между моделями
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Пауза между сообщениями
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 АНАЛИЗ РАЗЛИЧИЙ:');
    console.log('');
    console.log('🔍 Обратите внимание на:');
    console.log('├─ 📝 Длину и детальность ответов');
    console.log('├─ 🎭 Адаптацию под профиль пользователя');
    console.log('├─ ⚡ Скорость генерации ответа');
    console.log('├─ 🧠 Понимание контекста и нюансов');
    console.log('├─ 💰 Стоимость использования (nano дешевле)');
    console.log('└─ 🎨 Креативность и естественность');
    console.log('');
    console.log('💡 GPT-5 Nano: быстрый и экономный для базового общения');
    console.log('💎 GPT-5 Chat Latest: более умный для сложных разговоров');
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Сравнение моделей завершено!');
    console.log('='.repeat(80) + '\n');
    
    profiler.close();
    
  } catch (error) {
    Logger.error('Ошибка сравнения моделей:', error);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}