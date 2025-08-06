import { promises as fs } from 'fs';
import { TelegramExport, TelegramExportMessage } from './types.js';

interface MockUser {
  name: string;
  messageStyle: string[];
  emojis: string[];
  activityPattern: number[]; // 24 часа, веса для времени суток
  wordsPool: string[];
}

export class MockChatGenerator {
  private users: MockUser[] = [
    {
      name: 'Алексей Петров',
      messageStyle: ['Привет всем!', 'Как дела?', 'Что думаете?', 'Согласен', 'Не согласен', 'Интересно'],
      emojis: ['😄', '👍', '🔥', '💪'],
      activityPattern: [0,0,0,0,0,0,1,2,3,4,3,2,3,4,5,6,4,3,2,1,1,1,0,0], // утром активнее
      wordsPool: ['работа', 'проект', 'задача', 'дедлайн', 'встреча', 'код', 'баг', 'фича', 'релиз']
    },
    {
      name: 'Мария Иванова', 
      messageStyle: ['Офигеть', 'Круто!', 'А я думаю', 'Кстати', 'Между прочим', 'Вообще'],
      emojis: ['😊', '❤️', '🎉', '✨', '🌸'],
      activityPattern: [0,0,0,0,0,1,1,2,2,1,1,2,3,2,3,4,5,6,4,3,2,1,1,0], // вечером активнее
      wordsPool: ['дизайн', 'красиво', 'стиль', 'цвет', 'шрифт', 'макет', 'идея', 'концепт', 'бренд']
    },
    {
      name: 'Дмитрий К.',
      messageStyle: ['Хм', 'Логично', 'С одной стороны', 'С другой стороны', 'Возможно', 'Скорее всего'],
      emojis: ['🤔', '🧐', '📊', '💡'],
      activityPattern: [0,0,0,0,0,0,0,1,2,4,5,6,5,4,3,2,2,1,1,1,0,0,0,0], // рабочее время
      wordsPool: ['аналитика', 'данные', 'метрики', 'статистика', 'тренд', 'рост', 'конверсия', 'воронка']
    },
    {
      name: 'Анна Smile',
      messageStyle: ['Ребят', 'Народ', 'Слушайте', 'А вы знали', 'Прикиньте', 'Жесть какая'],
      emojis: ['😍', '🥳', '🎊', '🌟', '💫', '🦄'],
      activityPattern: [1,0,0,0,0,0,1,1,1,1,2,3,4,3,3,4,5,6,5,4,3,2,2,1], // вечерний тип
      wordsPool: ['вечеринка', 'музыка', 'фильм', 'сериал', 'книга', 'путешествие', 'кафе', 'выходные']
    },
    {
      name: 'Сергей Тех',
      messageStyle: ['Технически', 'В принципе', 'Архитектурно', 'Производительность', 'Оптимизация', 'Рефакторинг'],
      emojis: ['⚡', '🚀', '💻', '⚙️'],
      activityPattern: [2,1,1,0,0,0,0,1,3,4,5,4,3,3,4,5,4,3,2,2,3,4,3,2], // ночной кодер
      wordsPool: ['сервер', 'база', 'апи', 'микросервис', 'докер', 'кубернетес', 'мониторинг', 'логи']
    }
  ];

  private templates: string[] = [
    'Что думаете про {topic}?',
    'А помните как мы {action}',
    'Кто-нибудь пробовал {topic}?',
    'У меня {feeling} от {topic}',
    'Народ, а как вам {topic}?',
    'Вчера видел {topic}, прикольно',
    'А я считаю что {topic} - это {opinion}',
    'Кстати про {topic} - {opinion}',
    'Может обсудим {topic}?',
    'Имхо {topic} {opinion}'
  ];

  private topics: string[] = [
    'новый айфон', 'погода', 'пробки', 'работа', 'выходные', 'отпуск', 'кино', 'сериалы',
    'игры', 'спорт', 'футбол', 'политика', 'экономика', 'криптовалюта', 'акции', 'стартапы',
    'технологии', 'AI', 'чат-боты', 'программирование', 'дизайн', 'маркетинг', 'блокчейн'
  ];

  private actions: string[] = [
    'обсуждали это', 'смеялись над этим', 'спорили об этом', 'работали над этим', 
    'планировали это', 'делали это', 'изучали это', 'тестировали это'
  ];

  private feelings: string[] = [
    'восторг', 'сомнения', 'вопросы', 'идеи', 'планы', 'мысли', 'опасения', 'надежды'
  ];

  private opinions: string[] = [
    'круто', 'так себе', 'интересно', 'бесполезно', 'перспективно', 'устарело',
    'необходимо', 'переоценено', 'недооценено', 'революционно', 'обычно', 'гениально'
  ];

  /**
   * Генерирует случайное сообщение для пользователя
   */
  private generateMessage(user: MockUser, timestamp: Date): string {
    const rand = Math.random();
    
    if (rand < 0.3) {
      // Простая фраза из стиля пользователя
      return this.pickRandom(user.messageStyle) + (Math.random() < 0.3 ? ' ' + this.pickRandom(user.emojis) : '');
    } else if (rand < 0.6) {
      // Сообщение с эмодзи и словами из пула
      const words = this.pickRandom(user.wordsPool, 2, 4);
      const emoji = Math.random() < 0.5 ? ' ' + this.pickRandom(user.emojis) : '';
      return words.join(' ') + emoji;
    } else {
      // Сообщение по шаблону
      const template = this.pickRandom(this.templates);
      const topic = this.pickRandom(this.topics);
      const action = this.pickRandom(this.actions);
      const feeling = this.pickRandom(this.feelings);
      const opinion = this.pickRandom(this.opinions);
      
      const message = template
        .replace('{topic}', topic)
        .replace('{action}', action)
        .replace('{feeling}', feeling)
        .replace('{opinion}', opinion);
        
      return message + (Math.random() < 0.2 ? ' ' + this.pickRandom(user.emojis) : '');
    }
  }

  /**
   * Выбирает случайный элемент из массива или несколько элементов
   */
  private pickRandom<T>(array: T[], min: number = 1, max: number = 1): T | T[] {
    if (min === 1 && max === 1) {
      return array[Math.floor(Math.random() * array.length)];
    }
    
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const result = [];
    const used = new Set();
    
    while (result.length < count && result.length < array.length) {
      const index = Math.floor(Math.random() * array.length);
      if (!used.has(index)) {
        used.add(index);
        result.push(array[index]);
      }
    }
    
    return result;
  }

  /**
   * Генерирует временную метку с учетом паттерна активности пользователя
   */
  private generateTimestamp(user: MockUser, baseTime: Date): Date {
    // Выбираем час на основе паттерна активности пользователя
    const weights = user.activityPattern;
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * totalWeight;
    let hour = 0;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        hour = i;
        break;
      }
    }
    
    // Добавляем случайные минуты
    const minutes = Math.floor(Math.random() * 60);
    const seconds = Math.floor(Math.random() * 60);
    
    const timestamp = new Date(baseTime);
    timestamp.setHours(hour, minutes, seconds);
    
    return timestamp;
  }

  /**
   * Генерирует медиа сообщения
   */
  private generateMediaMessage(user: MockUser, timestamp: Date): TelegramExportMessage {
    const mediaTypes = ['photo', 'sticker', 'document', 'voice_message'] as const;
    const mediaType = this.pickRandom(mediaTypes) as any;
    
    const baseMessage: TelegramExportMessage = {
      id: Math.floor(Math.random() * 1000000),
      type: 'message',
      date: timestamp.toISOString(),
      date_unixtime: Math.floor(timestamp.getTime() / 1000),
      from: user.name,
      media_type: mediaType
    };

    switch (mediaType) {
      case 'photo':
        return { ...baseMessage, file: 'photo.jpg', width: 1920, height: 1080 };
      case 'sticker':
        return { ...baseMessage, file: 'sticker.webp', sticker_emoji: this.pickRandom(user.emojis) as string };
      case 'document':
        return { ...baseMessage, file: 'document.pdf', mime_type: 'application/pdf' };
      case 'voice_message':
        return { ...baseMessage, file: 'voice.oga', duration_seconds: Math.floor(Math.random() * 60) + 5 };
      default:
        return baseMessage;
    }
  }

  /**
   * Генерирует мок-чат с заданным количеством сообщений
   */
  async generateMockChat(messageCount: number = 1000): Promise<TelegramExport> {
    console.log(`🎭 Генерируем мок-чат с ${messageCount} сообщениями...`);
    
    const messages: TelegramExportMessage[] = [];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 дней назад
    
    for (let i = 0; i < messageCount; i++) {
      // Выбираем случайного пользователя
      const user = this.pickRandom(this.users) as MockUser;
      
      // Генерируем временную метку (распределяем по 30 дням)
      const dayOffset = Math.floor(i / (messageCount / 30));
      const baseTime = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const timestamp = this.generateTimestamp(user, baseTime);
      
      // 10% шанс на медиа сообщение
      if (Math.random() < 0.1) {
        messages.push(this.generateMediaMessage(user, timestamp));
      } else {
        // Обычное текстовое сообщение
        const text = this.generateMessage(user, timestamp);
        
        messages.push({
          id: i + 1,
          type: 'message',
          date: timestamp.toISOString(),
          date_unixtime: Math.floor(timestamp.getTime() / 1000),
          from: user.name,
          text: text
        });
      }
    }
    
    // Сортируем по времени
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Генерируем финальную структуру экспорта
    const mockExport: TelegramExport = {
      name: 'Тестовый чат разработчиков',
      type: 'private_supergroup',
      id: -123456789,
      messages: messages
    };
    
    console.log(`✅ Сгенерировано ${messages.length} сообщений от ${this.users.length} пользователей`);
    return mockExport;
  }

  /**
   * Сохраняет мок-чат в файл
   */
  async saveMockChat(filePath: string, messageCount: number = 1000): Promise<void> {
    const mockChat = await this.generateMockChat(messageCount);
    await fs.writeFile(filePath, JSON.stringify(mockChat, null, 2), 'utf-8');
    console.log(`💾 Мок-чат сохранен: ${filePath}`);
  }
}

// Если файл запущен напрямую
if (require.main === module) {
  const generator = new MockChatGenerator();
  const messageCount = parseInt(process.argv[2]) || 1000;
  const fileName = process.argv[3] || 'mock-chat.json';
  generator.saveMockChat(fileName, messageCount)
    .then(() => console.log('🎉 Готово! Теперь можете запустить: bun run analyze ' + fileName))
    .catch(console.error);
}