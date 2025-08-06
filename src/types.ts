import type { User, Message } from 'node-telegram-bot-api';

// Используем стандартные типы Telegram для базовых сущностей
export type TelegramUser = User;

// Расширяем типы для экспорта (Telegram Desktop экспорт имеет свой формат)
export interface TelegramExportMessage {
  id: number;
  type: string;
  date: string;
  date_unixtime: number;
  from?: string;
  from_id?: string;
  text?: string | TextEntity[];
  text_entities?: TextEntity[];
  file?: string;
  file_name?: string;
  file_size?: number;
  thumbnail?: string;
  media_type?: 'photo' | 'video_file' | 'document' | 'sticker' | 'voice_message' | 'audio_file';
  mime_type?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  sticker_emoji?: string;
  reply_to_message_id?: number;
  forwarded_from?: string;
  contact_information?: any;
  location_information?: any;
  live_location_information?: any;
  venue_information?: any;
  game_information?: any;
  invoice_information?: any;
  poll?: any;
  action?: string;
  title?: string;
  members?: string[];
  photo?: string;
  photo_file_size?: number;
  edited?: string;
  edited_unixtime?: number;
  actor?: string;
  actor_id?: string;
}

// Telegram экспорт может иметь текст в виде массива объектов
export interface TextEntity {
  type: 'plain' | 'bold' | 'italic' | 'link' | 'mention' | 'hashtag' | 'cashtag' | 'bot_command' | 'url' | 'email' | 'phone_number' | 'text_link' | 'text_mention';
  text: string;
  href?: string;
  user_id?: number;
}

export interface TelegramExportUser {
  id: number;
  is_self?: boolean;
  is_contact?: boolean;
  is_mutual_contact?: boolean;
  is_deleted?: boolean;
  is_bot?: boolean;
  is_verified?: boolean;
  is_restricted?: boolean;
  is_scam?: boolean;
  is_fake?: boolean;
  is_premium?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  phone?: string;
  photo?: any;
  status?: any;
  lang_code?: string;
}

export interface TelegramExport {
  name: string;
  type: 'personal_chat' | 'private_supergroup' | 'private_channel' | 'public_supergroup' | 'public_channel';
  id: number;
  messages: TelegramExportMessage[];
  users?: { [key: string]: TelegramExportUser };
}

// Наши аналитические типы
export interface UserStats {
  id: string;
  name: string;
  messageCount: number;
  characterCount: number;
  averageMessageLength: number;
  firstMessage: Date;
  lastMessage: Date;
  activeDays: number;
  messagesPerDay: number;
  popularWords: Array<{ word: string; count: number }>;
  popularEmojis: Array<{ emoji: string; count: number }>;
  timeActivity: { [hour: string]: number };
  dayActivity: { [day: string]: number };
}

export interface ChatAnalytics {
  totalMessages: number;
  totalUsers: number;
  dateRange: {
    start: Date;
    end: Date;
    days: number;
  };
  messagesPerDay: number;
  topUsers: UserStats[];
  popularWords: Array<{ word: string; count: number }>;
  popularEmojis: Array<{ emoji: string; count: number }>;
  messageTypes: { [type: string]: number };
  timeActivity: { [hour: string]: number };
  dayActivity: { [day: string]: number };
  averageMessageLength: number;
  mediaStats: {
    photos: number;
    videos: number;
    documents: number;
    stickers: number;
    voice: number;
    audio: number;
  };
}