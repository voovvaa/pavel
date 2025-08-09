import { UserProfiler } from './user-profiler.js';
import { Logger } from '../utils/logger.js';
import { validateConfig } from '../core/config.js';

async function main() {
  try {
    validateConfig();
    
    // Используем тот же chat_id что и в памяти
    const chatId = '316537427';
    const profiler = new UserProfiler(chatId);
    
    console.log('\n' + '='.repeat(60));
    console.log('👤 АНАЛИЗ ПРОФИЛЕЙ ПОЛЬЗОВАТЕЛЕЙ');
    console.log('='.repeat(60));
    
    // Анализируем всех пользователей
    const profiles = await profiler.analyzeAllUsers();
    
    console.log(`\n📊 Проанализировано профилей: ${profiles.length}\n`);
    
    // Показываем топ-3 самых активных пользователей
    const topUsers = profiles
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 3);
    
    for (let i = 0; i < topUsers.length; i++) {
      const profile = topUsers[i];
      const rank = ['🥇', '🥈', '🥉'][i];
      
      console.log(`${rank} ${profiler.getProfileSummary(profile)}\n`);
      
      // Детальная информация для первого пользователя
      if (i === 0) {
        console.log('📝 Детальный анализ самого активного пользователя:');
        console.log(`├─ Сообщений в день: ${profile.temporalPattern.averageMessagesPerDay.toFixed(1)}`);
        console.log(`├─ Средняя длина сообщения: ${profile.averageMessageLength} символов`);
        console.log(`├─ Размер словаря: ${profile.languageFeatures.vocabularySize} уникальных слов`);
        console.log(`├─ Пик активности: ${profile.activityPattern.peakActivity}:00`);
        console.log(`├─ Формальность: ${(profile.communicationStyle.formalityLevel * 100).toFixed(0)}%`);
        console.log(`├─ Эмоциональность: ${(profile.communicationStyle.emotionalExpression * 100).toFixed(0)}%`);
        console.log(`├─ Инициативность: ${(profile.communicationStyle.initiationRate * 100).toFixed(0)}%`);
        console.log(`├─ Юмор: ${(profile.socialBehavior.humor * 100).toFixed(0)}%`);
        console.log(`├─ Поддержка: ${(profile.socialBehavior.supportiveness * 100).toFixed(0)}%`);
        console.log(`├─ Готовность помочь: ${(profile.socialBehavior.helpfulness * 100).toFixed(0)}%`);
        console.log(`└─ Уверенность анализа: ${(profile.confidence * 100).toFixed(0)}%`);
        
        if (profile.languageFeatures.commonWords.length > 0) {
          console.log(`\n🔤 Популярные слова: ${profile.languageFeatures.commonWords.slice(0, 5).join(', ')}`);
        }
        
        if (profile.languageFeatures.commonEmojis.length > 0) {
          console.log(`😊 Популярные эмодзи: ${profile.languageFeatures.commonEmojis.join(' ')}`);
        }
        
        if (profile.interests.topTopics.length > 0) {
          console.log(`📋 Топ темы: ${profile.interests.topTopics.slice(0, 3).map(t => `${t.topic} (${(t.frequency * 100).toFixed(0)}%)`).join(', ')}`);
        }
        
        console.log('');
      }
    }
    
    // Общая статистика
    const totalMessages = profiles.reduce((sum, p) => sum + p.messageCount, 0);
    const avgConfidence = profiles.reduce((sum, p) => sum + p.confidence, 0) / profiles.length;
    
    console.log('📈 ОБЩАЯ СТАТИСТИКА:');
    console.log(`├─ Всего проанализированных сообщений: ${totalMessages.toLocaleString()}`);
    console.log(`├─ Средняя уверенность анализа: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`├─ Самый формальный: ${profiles.sort((a, b) => b.communicationStyle.formalityLevel - a.communicationStyle.formalityLevel)[0]?.userName || 'N/A'}`);
    console.log(`├─ Самый эмоциональный: ${profiles.sort((a, b) => b.communicationStyle.emotionalExpression - a.communicationStyle.emotionalExpression)[0]?.userName || 'N/A'}`);
    console.log(`├─ Самый юморной: ${profiles.sort((a, b) => b.socialBehavior.humor - a.socialBehavior.humor)[0]?.userName || 'N/A'}`);
    console.log(`└─ Самый поддерживающий: ${profiles.sort((a, b) => b.socialBehavior.supportiveness - a.socialBehavior.supportiveness)[0]?.userName || 'N/A'}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Анализ профилей завершен!');
    console.log('='.repeat(60) + '\n');
    
    profiler.close();
    
  } catch (error) {
    Logger.error('Ошибка анализа профилей:', error);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}