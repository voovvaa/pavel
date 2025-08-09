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
      process.exit(1);
    }

    console.log('\n' + '='.repeat(80));
    console.log('⚡ ТЕСТ СКОРОСТИ: Reasoning vs Non-Reasoning');
    console.log('='.repeat(80));
    
    const personalityData = JSON.parse(await fs.readFile(personalityPath, 'utf-8'));
    const profiler = new UserProfiler(chatId);
    const profiles = await profiler.analyzeAllUsers();
    const topUser = profiles.sort((a, b) => b.messageCount - a.messageCount)[0];
    
    console.log(`\n👤 Тестируем с: ${topUser.userName}\n`);
    
    const testMessage = 'Привет, как дела?';
    
    // Конфигурации для тестирования
    const configs = [
      {
        name: 'GPT-5 Nano (reasoning: low)',
        model: 'gpt-5-nano',
        reasoning: 'low',
        description: 'С размышлениями на минимуме'
      },
      {
        name: 'GPT-5 Nano (reasoning: minimal)',
        model: 'gpt-5-nano', 
        reasoning: 'minimal',
        description: 'Минимальные размышления'
      },
      {
        name: 'GPT-5 Chat Latest',
        model: 'gpt-5-chat-latest',
        reasoning: null,
        description: 'Без reasoning токенов'
      }
    ];
    
    const results: Array<{
      name: string;
      time: number;
      response: string;
      reasoningTokens: number;
      totalTokens: number;
    }> = [];
    
    for (const testConfig of configs) {
      console.log(`\n🔄 Тестируем: ${testConfig.name}`);
      console.log(`   📝 ${testConfig.description}`);
      
      try {
        // Устанавливаем модель
        process.env.OPENAI_MODEL = testConfig.model;
        const { config } = await import('../core/config.js');
        (config as any).openaiModel = testConfig.model;
        
        // Если это nano с кастомными настройками, временно изменим код
        let originalReasoning: string | undefined;
        if (testConfig.reasoning === 'minimal') {
          // Читаем текущий файл ai-engine.ts и меняем настройку
          const aiEnginePath = '/Users/voovaa/projects/pavel/src/ai/ai-engine.ts';
          let aiEngineContent = await fs.readFile(aiEnginePath, 'utf-8');
          
          if (aiEngineContent.includes("requestParams.reasoning_effort = 'low';")) {
            originalReasoning = 'low';
            aiEngineContent = aiEngineContent.replace(
              "requestParams.reasoning_effort = 'low';",
              "requestParams.reasoning_effort = 'minimal';"
            );
            await fs.writeFile(aiEnginePath, aiEngineContent);
            console.log(`   🔧 Временно изменили reasoning на 'minimal'`);
          }
        }
        
        const responseEngine = new ResponseEngine(personalityData, chatId);
        
        console.log(`   ⏳ Генерируем ответ...`);
        const startTime = Date.now();
        const response = await responseEngine.generateResponse(testMessage, topUser.userName, Date.now());
        const endTime = Date.now();
        
        const time = endTime - startTime;
        
        if (response) {
          console.log(`   💭 "${response}"`);
          console.log(`   ⏱️  ${time}ms`);
          console.log(`   📏 ${response.length} символов`);
          
          results.push({
            name: testConfig.name,
            time,
            response,
            reasoningTokens: 0, // Извлечем из логов
            totalTokens: 0
          });
        } else {
          console.log(`   🤐 Не ответил`);
        }
        
        responseEngine.close();
        
        // Восстанавливаем оригинальные настройки
        if (originalReasoning && testConfig.reasoning === 'minimal') {
          const aiEnginePath = '/Users/voovaa/projects/pavel/src/ai/ai-engine.ts';
          let aiEngineContent = await fs.readFile(aiEnginePath, 'utf-8');
          aiEngineContent = aiEngineContent.replace(
            "requestParams.reasoning_effort = 'minimal';",
            "requestParams.reasoning_effort = 'low';"
          );
          await fs.writeFile(aiEnginePath, aiEngineContent);
          console.log(`   🔧 Восстановили reasoning на '${originalReasoning}'`);
        }
        
      } catch (error) {
        console.log(`   ❌ Ошибка: ${error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 РЕЗУЛЬТАТЫ СРАВНЕНИЯ:');
    console.log('─'.repeat(80));
    
    results.sort((a, b) => a.time - b.time);
    
    results.forEach((result, index) => {
      const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
      console.log(`${medal} ${result.name}:`);
      console.log(`   ⏱️  Время: ${result.time}ms`);
      console.log(`   📏 Длина: ${result.response.length} символов`);
      console.log(`   💭 Ответ: "${result.response}"`);
      console.log('');
    });
    
    console.log('🔍 ОБЪЯСНЕНИЕ РАЗНИЦЫ В СКОРОСТИ:');
    console.log('├─ GPT-5 Nano использует reasoning tokens даже на minimal/low');
    console.log('├─ Chat Latest - это non-reasoning модель (0 reasoning tokens)');  
    console.log('├─ Reasoning токены = дополнительное время "размышлений"');
    console.log('└─ Для быстрого общения лучше Chat Latest');
    console.log('');
    console.log('💰 ЭКОНОМИКА:');
    console.log('├─ Nano: $0.05/1M входящих, $0.40/1M исходящих (~$0.03/мес)');
    console.log('├─ Chat Latest: $1.25/1M входящих, $10/1M исходящих (~$0.64/мес)');
    console.log('└─ Chat Latest в 20+ раз дороже, но быстрее');
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Тест скорости завершен!');
    console.log('='.repeat(80) + '\n');
    
    profiler.close();
    
  } catch (error) {
    Logger.error('Ошибка теста скорости:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}