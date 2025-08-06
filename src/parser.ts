import { promises as fs } from 'fs';
import { TelegramExport, TelegramExportMessage, TextEntity } from './types.js';
import { Logger } from './logger.js';

export class TelegramParser {
  /**
   * Загружает и парсит JSON файл экспорта Telegram
   */
  static async loadExport(filePath: string): Promise<TelegramExport> {
    try {
      Logger.info(`Загружаем экспорт из файла: ${filePath}`);
      
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent) as TelegramExport;
      
      Logger.info(`Загружено сообщений: ${data.messages?.length || 0}`);
      Logger.info(`Название чата: ${data.name}`);
      Logger.info(`Тип чата: ${data.type}`);
      
      return data;
    } catch (error) {
      Logger.error('Ошибка при загрузке экспорта:', error);
      throw new Error(`Не удалось загрузить файл экспорта: ${error}`);
    }
  }

  /**
   * Извлекает текст из сообщения (может быть строкой или массивом TextEntity объектов)
   */
  static extractText(message: TelegramExportMessage): string {
    if (!message.text) return '';
    
    if (typeof message.text === 'string') {
      return message.text;
    }
    
    if (Array.isArray(message.text)) {
      return message.text
        .map((item: TextEntity | string) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && 'text' in item) return item.text;
          return '';
        })
        .join('');
    }
    
    return '';
  }

  /**
   * Фильтрует сообщения по типу и валидности
   */
  static filterValidMessages(messages: TelegramExportMessage[]): TelegramExportMessage[] {
    return messages.filter(msg => {
      // Только обычные сообщения с текстом или медиа
      if (msg.type !== 'message') return false;
      
      // Игнорируем служебные сообщения
      if (msg.action) return false;
      
      // Должен быть отправитель
      if (!msg.from && !msg.from_id) return false;
      
      return true;
    });
  }

  /**
   * Нормализует имя пользователя
   */
  static normalizeUserName(message: TelegramExportMessage): string {
    if (message.from) return message.from;
    if (message.from_id) return message.from_id;
    return 'Unknown';
  }

  /**
   * Извлекает эмодзи из текста
   */
  static extractEmojis(text: string): string[] {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return text.match(emojiRegex) || [];
  }

  /**
   * Очищает текст для анализа слов
   */
  static cleanTextForWordAnalysis(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ') // Только буквы и пробелы
      .replace(/\s+/g, ' ') // Множественные пробелы в один
      .trim();
  }

  /**
   * Извлекает слова из текста (минимум 3 символа, исключая стоп-слова)
   */
  static extractWords(text: string): string[] {
    const cleaned = this.cleanTextForWordAnalysis(text);
    const words = cleaned.split(' ').filter(word => word.length >= 3);
    
    // Расширенный список стоп-слов
    const stopWords = new Set([
      // Базовые русские стоп-слова
      'что', 'как', 'где', 'когда', 'почему', 'зачем', 'для', 'или', 'так',
      'это', 'тот', 'все', 'еще', 'уже', 'они', 'мне', 'нас', 'вас', 'его',
      'её', 'них', 'том', 'тем', 'кто', 'чем', 'над', 'под', 'при', 'без',
      'про', 'через', 'после', 'перед', 'между', 'среди', 'вокруг',
      'да', 'нет', 'то', 'будет', 'тут', 'вот', 'там', 'надо', 'меня', 'если', 'можно', 'есть', 'просто', 'только', 'тебя',
      
      // Дополнительные частые слова из анализа
      'было', 'был', 'была', 'были', 'быть', 'бы', 'бывает', 'бывал',
      'тоже', 'также', 'тогда', 'того', 'той', 'тех', 'теперь', 'типа',
      'ещё', 'еще', 'если', 'его', 'его', 'ее', 'её', 'ей', 'ему', 'им',
      'чтобы', 'чтоб', 'что-то', 'чего', 'чему', 'чем', 'чей', 'чье', 'чья',
      'пока', 'пока-то', 'потом', 'потому', 'поэтому', 'почему', 'прям',
      'даже', 'давай', 'дай', 'дали', 'дал', 'дала', 'дать', 'дело', 'день',
      'может', 'можешь', 'можете', 'могу', 'мог', 'могла', 'могли', 'мочь',
      'тебе', 'тебя', 'твой', 'твоя', 'твое', 'твои', 'твоим', 'твоей',
      'она', 'оно', 'они', 'оной', 'оному', 'оным', 'оной', 'оных',
      'ну', 'нет', 'не', 'нё', 'них', 'нем', 'ней', 'него', 'неё', 'нею',
      'вот', 'вон', 'вам', 'вас', 'всё', 'все', 'всем', 'всех', 'всего',
      'лет', 'ли', 'либо', 'лишь', 'люди', 'люди',
      'раз', 'раза', 'рас', 'разу', 'разе',
      'год', 'года', 'годы', 'лет', 'году', 'годов',
      'сам', 'сама', 'само', 'сами', 'самой', 'самом', 'самих', 'самого',
      'уже', 'уж', 'уши', 'ухо',
      'под', 'пол', 'полу', 'получи', 'получил', 'получить',
      'сейчас', 'сегодня', 'сразу', 'сначала', 'снова', 'слишком',
      'хотя', 'хоть', 'хочу', 'хочет', 'хочешь', 'хотел', 'хотела', 'хотели',
      'конечно', 'короче', 'кстати', 'куда', 'кого', 'кому', 'кем', 'ком',
      'совсем', 'совершенно', 'сначала', 'слишком', 'скорее',
      'точно', 'типо', 'теперь', 'такой', 'такая', 'такое', 'такие', 'так-то',
      'много', 'мало', 'мной', 'мною', 'моё', 'моя', 'мой', 'мои', 'моим',
      
      // Матные и сленговые слова (часто используемые служебные)
      'бля', 'блять', 'пиздец', 'нахуй', 'хуй', 'хуя', 'хую', 'хуе', 'хуём',
      'пизда', 'пизду', 'пизде', 'пиздой', 'пизды', 'пиздат', 'пиздато',
      'ебал', 'ебать', 'ебет', 'ебу', 'ебёт', 'ебаный', 'ебучий',
      'охуеть', 'охуел', 'охуела', 'охуели', 'охуенно', 'заебись', 'заебал',
      'сука', 'суки', 'суке', 'сукой', 'суку', 'сук',
      'дерьмо', 'говно', 'гавно', 'гавна', 'гавне', 'гавном',
      'блин', 'блядь', 'бляди', 'бляде', 'блядью', 'блядей',
      'чёрт', 'черт', 'чёрта', 'черта', 'чёрту', 'черту',
      
      // Сокращения и интернет-жаргон  
      'кек', 'лол', 'лул', 'омг', 'воу', 'вау', 'оке', 'окей', 'ок',
      'хех', 'хэх', 'ага', 'угу', 'неа', 'неее', 'даа', 'дааа',
      'хмм', 'хм', 'эмм', 'эм', 'ммм', 'хммм',
      'плз', 'пжлст', 'спс', 'тп', 'пп', 'лс', 'лд',
      'имхо', 'кмк', 'афаик', 'емнип', 'чсв',
      
      // Обращения и междометия
      'пацаны', 'парни', 'мужики', 'чуваки', 'бро', 'братан', 'братишка',
      'товарищи', 'друзья', 'коллеги', 'ребят', 'ребятки', 'народ',
      'чувак', 'мужик', 'пацан', 'парень', 'мен', 'братец',
      
      // Исключаем ники (все, что явно ник/юзернейм)
      'makc_am', 'leoniddddos', 'bogd228', 'zelfrare', 'volodyabalbeskin', 'old_boy_15', 'aleksanedro', 'soulseeker',
      'user7595678089', 'user6033632571', 'user673590329', 'user316537427', 'user676402625',
      
      // Английские короткие слова и служебные
      'the', 'and', 'for', 'you', 'are', 'but', 'not', 'all', 'can', 'with', 'was', 'have', 'has', 'get', 'got', 'out', 'one', 'two', 'too', 'who', 'why', 'how', 'her', 'him', 'his', 'she', 'our', 'let', 'may', 'any', 'yet', 'yes', 'no', 'did', 'had', 'didn', 'don', 'does', 'from', 'just', 'now', 'then', 'than', 'also', 'will', 'would', 'should', 'could', 'shall', 'might', 'must', 'very', 'much', 'such', 'own', 'same', 'each', 'every', 'other', 'another', 'some', 'many', 'most', 'more', 'less', 'few', 'lot', 'lots', 'still', 'even', 'ever', 'never', 'always', 'sometimes', 'often', 'usually', 'again', 'back', 'here', 'there', 'where', 'when', 'because', 'about', 'after', 'before', 'between', 'during', 'over', 'under', 'above', 'below', 'through', 'across', 'against', 'among', 'around', 'behind', 'beside', 'beyond', 'by', 'down', 'in', 'into', 'off', 'on', 'outside', 'past', 'since', 'to', 'toward', 'until', 'up', 'upon', 'within', 'without',
      
      // Технические и интернет слова
      'http', 'https', 'www', 'com', 'ru', 'net', 'org', 'html', 'php', 'css', 'js',
      'подписаться', 'подпишись', 'лайк', 'репост', 'шер', 'шейр'
    ]);
    
    return words.filter(word => !stopWords.has(word));
  }
}