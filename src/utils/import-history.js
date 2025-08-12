import fs from 'fs';
import { Database } from 'bun:sqlite';

// Определяем режим работы из переменной или аргумента
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

// Загружаем историю чата
const historyFile = isProduction
  ? '/app/chat/result.json' 
  : './chat/result.json';
const dbPath = isProduction
  ? '/app/data/memory.db' 
  : './memory.db';
  
console.log(`🔍 NODE_ENV: ${process.env.NODE_ENV} (production: ${isProduction})`);
console.log(`🗃️ Database path: ${dbPath}`);

console.log('📚 Загружаем историю чата...');
const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

// Удаляем старую базу и создаем новую  
try {
  fs.unlinkSync(dbPath);
  console.log('🗑️ Старая база данных удалена');
} catch (error) {
  // Файл не существует - это нормально
}

// Создаем новую базу данных
const db = new Database(dbPath);

console.log('🗃️ Создаем таблицы...');

// Создаем таблицы если их нет
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    message_type TEXT DEFAULT 'text',
    is_from_bot BOOLEAN DEFAULT 0,
    importance REAL DEFAULT 0.5,
    emotion TEXT DEFAULT 'neutral',
    topics TEXT DEFAULT '[]',
    mentions TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS chat_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    first_mentioned DATETIME NOT NULL,
    last_mentioned DATETIME NOT NULL,
    mention_count INTEGER DEFAULT 1,
    related_users TEXT DEFAULT '[]',
    importance REAL DEFAULT 0.5,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, topic)
  );

  CREATE TABLE IF NOT EXISTS user_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    interaction_count INTEGER DEFAULT 0,
    last_interaction DATETIME,
    relationship_type TEXT DEFAULT 'neutral',
    shared_topics TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_name)
  );
`);

console.log('✅ Таблицы созданы');

// Подготавливаем запросы
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages (
    chat_id, message_id, author, content, timestamp, 
    message_type, is_from_bot, importance, emotion, topics, mentions
  ) VALUES ($chat_id, $message_id, $author, $content, $timestamp, 'text', 0, $importance, $emotion, $topics, $mentions)
`);

const insertTopic = db.prepare(`
  INSERT OR IGNORE INTO chat_topics (
    chat_id, topic, first_mentioned, last_mentioned,
    mention_count, related_users, importance, status
  ) VALUES ($chat_id, $topic, $first_mentioned, $last_mentioned, 1, $related_users, 0.5, 'active')
`);

const updateTopic = db.prepare(`
  UPDATE chat_topics 
  SET last_mentioned = $last_mentioned, mention_count = mention_count + 1,
      importance = MIN(1.0, importance + 0.05)
  WHERE chat_id = $chat_id AND topic = $topic
`);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO user_relationships (
    chat_id, user_name, relationship_type, last_interaction,
    interaction_count, shared_topics
  ) VALUES ($chat_id, $user_name, 'friend', $last_interaction, 1, '[]')
`);

const updateUser = db.prepare(`
  UPDATE user_relationships 
  SET last_interaction = $last_interaction, interaction_count = interaction_count + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE chat_id = $chat_id AND user_name = $user_name
`);

// Фильтруем все сообщения (вся история чата)
console.log('📅 Импортируем всю историю чата...');

const messages = history.messages.filter(msg => {
  if (msg.type !== 'message') return false;
  if (!msg.text || typeof msg.text !== 'string') return false;
  if (msg.text.trim().length < 3) return false; // Пропускаем очень короткие
  
  return true; // Импортируем все сообщения!
});

console.log(`✅ Найдено ${messages.length} подходящих сообщений для импорта`);

// Мапим имена пользователей (чтобы "Володя" = "Володя")
const nameMap = {
  'Володя': 'Володя',
  'Леонид Колмаков': 'Леонид',
  'Бодя': 'Бодя',
  'Гейсандр Кулович': 'Гейсандр Кулович'
};

// Функция для извлечения тем из текста
function extractTopics(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\sа-яё]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4);
  
  const stopWords = new Set([
    'саня', 'гейсандр', 'кулович', 'вроде', 'думаю', 'норм', 'ваще',
    'богдан', 'онлайн', 'реально', 'только', 'говорил', 'помню',
    'макс', 'ушел', 'была', 'были', 'есть', 'будет', 'может', 'очень',
    'володя', 'леонид', 'бодя'
  ]);
  
  return words
    .filter(word => !stopWords.has(word) && word.length >= 5)
    .slice(0, 3); // Только топ-3 темы
}

// Функция определения эмоции
function detectEmotion(text) {
  const lowerText = text.toLowerCase();
  
  const emotions = {
    positive: ['круто', 'класс', 'супер', 'отлично', 'здорово', 'норм', 'збс', 'кайф'],
    negative: ['плохо', 'ужас', 'бесит', 'грустно', 'блять', 'пиздец', 'херня'],
    excited: ['вау', 'офигеть', 'охуеть', 'пиздато', 'ахуенно'],
    friendly: ['привет', 'здарова', 'как дела', 'что делаешь']
  };
  
  for (const [emotion, words] of Object.entries(emotions)) {
    if (words.some(word => lowerText.includes(word))) {
      return emotion;
    }
  }
  
  return 'neutral';
}

// Рассчитываем важность сообщения
function calculateImportance(text, author) {
  let importance = 0.3;
  
  // Прямые обращения важнее
  if (text.toLowerCase().includes('гейсандр') || text.toLowerCase().includes('саня')) {
    importance += 0.4;
  }
  
  // Длинные сообщения важнее
  if (text.length > 100) importance += 0.2;
  if (text.includes('?')) importance += 0.1;
  
  return Math.min(1.0, importance);
}

// Импортируем сообщения
console.log('💾 Начинаем импорт...');

const chatId = '1460632856'; // ID чата из истории
let importedCount = 0;
let skippedCount = 0;

db.run('BEGIN TRANSACTION');

for (const msg of messages) {
  try {
    const author = nameMap[msg.from] || msg.from;
    const text = msg.text.trim();
    const timestamp = new Date(msg.date).toISOString();
    const topics = extractTopics(text);
    const emotion = detectEmotion(text);
    const importance = calculateImportance(text, author);
    
    // Сохраняем сообщение
    insertMessage.run({
      $chat_id: chatId,
      $message_id: msg.id,
      $author: author,
      $content: text,
      $timestamp: timestamp,
      $importance: importance,
      $emotion: emotion,
      $topics: JSON.stringify(topics),
      $mentions: JSON.stringify([])
    });
    
    // Обновляем темы
    topics.forEach(topic => {
      try {
        const result = updateTopic.run({
          $last_mentioned: timestamp,
          $chat_id: chatId,
          $topic: topic
        });
        if (result.changes === 0) {
          insertTopic.run({
            $chat_id: chatId,
            $topic: topic,
            $first_mentioned: timestamp,
            $last_mentioned: timestamp,
            $related_users: JSON.stringify([author])
          });
        }
      } catch (error) {
        // Игнорируем ошибки дубликатов
      }
    });
    
    // Обновляем пользователя
    try {
      const result = updateUser.run({
        $last_interaction: timestamp,
        $chat_id: chatId,
        $user_name: author
      });
      if (result.changes === 0) {
        insertUser.run({
          $chat_id: chatId,
          $user_name: author,
          $last_interaction: timestamp
        });
      }
    } catch (error) {
      // Игнорируем ошибки дубликатов
    }
    
    importedCount++;
    
    if (importedCount % 1000 === 0) {
      console.log(`📈 Импортировано ${importedCount} сообщений...`);
    }
    
  } catch (error) {
    skippedCount++;
    if (skippedCount < 10) {
      console.warn(`⚠️ Пропускаем сообщение ${msg.id}:`, error.message);
    }
  }
}

db.run('COMMIT');

console.log(`✅ Импорт завершен!`);

// Принудительно синхронизируем базу данных
console.log('💾 Синхронизируем базу данных...');
db.run('PRAGMA synchronous = FULL');
db.run('VACUUM');
console.log(`📊 Импортировано: ${importedCount} сообщений`);
console.log(`⏭️ Пропущено: ${skippedCount} сообщений`);

// Показываем статистику
const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE chat_id = $chat_id').get({ $chat_id: chatId });
const totalTopics = db.prepare('SELECT COUNT(*) as count FROM chat_topics WHERE chat_id = $chat_id').get({ $chat_id: chatId });
const totalUsers = db.prepare('SELECT COUNT(*) as count FROM user_relationships WHERE chat_id = $chat_id').get({ $chat_id: chatId });

console.log(`\n📈 Итоговая статистика базы данных:`);
console.log(`💬 Всего сообщений: ${totalMessages.count}`);
console.log(`🏷️ Всего тем: ${totalTopics.count}`);
console.log(`👥 Всего пользователей: ${totalUsers.count}`);

console.log('💾 Финальная синхронизация...');
db.run('PRAGMA wal_checkpoint(FULL)'); // Принудительно записываем WAL файл
db.run('PRAGMA optimize');
console.log(`📁 База данных находится в: ${dbPath}`);
const dbExists = require('fs').existsSync(dbPath);
console.log(`📊 Файл базы существует: ${dbExists}`);
if (dbExists) {
  const stats = require('fs').statSync(dbPath);
  console.log(`📏 Размер файла: ${Math.round(stats.size / 1024)}KB`);
}
db.close();
console.log('🎉 Готово! Гейсандр теперь помнит всю историю чата!');