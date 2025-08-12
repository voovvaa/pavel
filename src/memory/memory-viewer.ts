import { MemoryManager } from './memory-manager.js';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';

async function showAllChats() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 ВСЕ ЧАТЫ В ПАМЯТИ ГЕЙСАНДРА КУЛОВИЧА');
  console.log('='.repeat(60));
  
  const tempManager = new MemoryManager('temp');
  try {
    const allChats = (tempManager as any).db.prepare(`
      SELECT 
        chat_id,
        COUNT(*) as message_count,
        COUNT(DISTINCT author) as user_count,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message,
        AVG(importance) as avg_importance
      FROM messages 
      GROUP BY chat_id 
      ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
    `).all() as any[];
    
    tempManager.close();
    
    if (allChats.length === 0) {
      console.log('\n❌ Чаты не найдены. База данных пуста.');
      console.log('💡 Запустите бота и отправьте ему сообщения.');
      return;
    }
    
    console.log(`\n📊 Найдено ${allChats.length} чат(ов):\n`);
    
    allChats.forEach((chat: any, index: number) => {
      const firstMsg = new Date(chat.first_message).toLocaleString('ru-RU');
      const lastMsg = new Date(chat.last_message).toLocaleString('ru-RU');
      const avgImportance = '★'.repeat(Math.round(chat.avg_importance * 5));
      
      console.log(`${index + 1}. 💬 Чат ID: ${chat.chat_id}`);
      console.log(`   📊 ${chat.message_count} сообщений, ${chat.user_count} пользователей`);
      console.log(`   ⭐ Средняя важность: ${avgImportance} (${chat.avg_importance.toFixed(2)})`);
      console.log(`   📅 Первое: ${firstMsg}`);
      console.log(`   📅 Последнее: ${lastMsg}`);
      console.log('');
    });
    
    console.log('💡 Для просмотра конкретного чата:');
    console.log('   bun run memory-stats <chat_id>');
    console.log('\n💡 Для автопросмотра самого активного:');
    console.log('   bun run memory-stats');
    
  } catch (error) {
    tempManager.close();
    console.log('\n❌ Ошибка при получении списка чатов:', error);
  }
}

async function main() {
  try {
    let chatId = process.argv[2];
    
    // Специальная команда для показа всех чатов
    if (chatId === '--list' || chatId === '-l') {
      await showAllChats();
      return;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🧠 ПРОСМОТР ПАМЯТИ ГЕЙСАНДРА КУЛОВИЧА');
    console.log('='.repeat(60));
    
    // Если chatId не указан, найдем активные чаты
    if (!chatId) {
      const tempManager = new MemoryManager('temp');
      try {
        const activeChats = (tempManager as any).db.prepare(`
          SELECT chat_id, COUNT(*) as message_count,
                 MAX(timestamp) as last_message
          FROM messages 
          GROUP BY chat_id 
          ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
        `).all() as any[];
        
        tempManager.close();
        
        if (activeChats.length === 0) {
          console.log('\n❌ Активные чаты не найдены. База данных пуста.');
          console.log('💡 Запустите бота и отправьте ему сообщение, затем повторите команду.');
          return;
        }
        
        if (activeChats.length === 1) {
          // Если только один чат, используем его автоматически
          chatId = activeChats[0].chat_id;
          console.log(`\n🎯 Найден один активный чат: ${chatId}`);
        } else {
          // Показываем все чаты и используем самый активный
          chatId = activeChats[0].chat_id;
          console.log(`\n📋 Найдено ${activeChats.length} активных чатов:`);
          activeChats.forEach((chat: any, index: number) => {
            const indicator = index === 0 ? '👉' : '  ';
            const lastMsg = new Date(chat.last_message).toLocaleString('ru-RU');
            console.log(`${indicator} ${chat.chat_id}: ${chat.message_count} сообщений (посл.: ${lastMsg})`);
          });
          console.log(`\n🎯 Показываем самый активный чат: ${chatId}`);
          console.log(`💡 Для просмотра другого чата: bun run memory-stats <chat_id>`);
        }
      } catch (error) {
        tempManager.close();
        console.log('\n❌ Ошибка при поиске чатов:', error);
        return;
      }
    }
    
    console.log('─'.repeat(60));
    const memoryManager = new MemoryManager(chatId);
    
    // Статистика памяти
    const stats = memoryManager.getMemoryStats();
    console.log('\n📊 СТАТИСТИКА ПАМЯТИ:');
    console.log(`├─ Всего сообщений: ${stats.totalMessages.toLocaleString()}`);
    console.log(`├─ Пользователей: ${stats.totalUsers}`);
    console.log(`├─ Активных тем: ${stats.activeTopics}`);
    console.log(`└─ Размер базы: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} МБ`);
    
    // Недавние сообщения
    const recentMessages = memoryManager.getRecentMessages(10);
    console.log('\n💬 НЕДАВНИЕ СООБЩЕНИЯ:');
    recentMessages.forEach(msg => {
      const timeStr = msg.timestamp.toLocaleString('ru-RU');
      const importance = '★'.repeat(Math.round(msg.importance * 5));
      console.log(`├─ [${timeStr}] ${msg.author}: ${msg.content.substring(0, 60)}... ${importance}`);
    });
    
    // Активные темы
    const activeTopics = memoryManager.getActiveTopics(5);
    console.log('\n🎯 АКТИВНЫЕ ТЕМЫ:');
    activeTopics.forEach(topic => {
      console.log(`├─ ${topic.topic}: упоминаний ${topic.mentionCount}, важность ${topic.importance.toFixed(2)}`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Просмотр памяти завершен');
    console.log('='.repeat(60) + '\n');
    
    memoryManager.close();

  } catch (error) {
    Logger.error('Ошибка просмотра памяти:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Запуск если файл вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}