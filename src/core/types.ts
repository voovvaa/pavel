import type { User, Message } from 'node-telegram-bot-api';

// Типы для анализа изображений (ЭТАП 7)
export interface ImageAnalysisResult {
  description: string;
  content: string;
  type: 'photo' | 'meme' | 'screenshot' | 'document' | 'other';
  mood?: string;
  isNSFW?: boolean;
  containsText?: boolean;
  textContent?: string;
  isHumorous?: boolean;
  tags: string[];
}

// Re-export UserProfile из user-profiler для удобства
export type { UserProfile } from '../analysis/user-profiler.js';

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
  // Новые поля для паттернов
  commonPatterns?: ResponsePattern[];
  conversationFlows?: Array<{
    trigger: string;
    responses: Array<{
      text: string;
      frequency: number;
    }>;
  }>;
}

// Новые типы для системы паттернов
export interface TriggerPattern {
  id: string;
  keywords: string[];
  responses: string[];
  weight: number;
  context?: string;
  userSpecific?: boolean;
  timeSpecific?: {
    hours?: number[];
    days?: number[];
  };
}

export interface ResponsePattern {
  trigger: string;
  response: string;
  frequency: number;
  confidence: number;
  context: {
    prevMessages?: string[];
    timeOfDay?: number;
    dayOfWeek?: number;
    author?: string;
  };
}

// Новые типы для системы памяти
export interface MemoryEntry {
  id?: number;
  chatId: string;
  messageId: number;
  author: string;
  content: string;
  timestamp: Date;
  messageType: 'text' | 'media' | 'system' | 'image';
  isFromBot: boolean;
  context?: string;
  importance: number; // 0-1, важность сообщения
  emotion: 'positive' | 'negative' | 'neutral' | 'excited' | 'angry' | 'sad' | 'funny' | 'friendly' | 'curious' | 'engaging';
  topics?: string[]; // Темы которых касается сообщение
  mentions?: string[]; // Упоминания пользователей
  // Новые поля для изображений
  imageAnalysis?: ImageAnalysisResult;
  filePath?: string; // Путь к сохраненному файлу изображения
}

export interface ConversationSummary {
  id?: number;
  chatId: string;
  dateStart: Date;
  dateEnd: Date;
  participants: string[];
  mainTopics: string[];
  keyEvents: string[];
  mood: string;
  summary: string;
  messageCount: number;
}

export interface UserRelationship {
  id?: number;
  chatId: string;
  userName: string;
  relationship: 'friend' | 'colleague' | 'acquaintance' | 'unknown';
  lastInteraction: Date;
  interactionCount: number;
  commonTopics: string[];
  personalNotes: string[];
  mood: 'positive' | 'negative' | 'neutral';
}

export interface ChatTopic {
  id?: number;
  chatId: string;
  topic: string;
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  relatedUsers: string[];
  importance: number;
  status: 'active' | 'resolved' | 'ongoing' | 'archived';
}

export interface MemoryContext {
  recentMessages: MemoryEntry[];
  relevantHistory: MemoryEntry[];
  conversationSummaries: ConversationSummary[];
  userRelationships: Map<string, UserRelationship>;
  activeTopics: ChatTopic[];
  currentMood: string;
}

// Обновляем ChatContext для интеграции с памятью
export interface ChatContext {
  recentMessages: Array<{
    text: string;
    author: string;
    timestamp: Date;
  }>;
  currentTopic?: string;
  activeUsers: Set<string>;
  lastBotResponse?: Date;
  messagesSinceLastResponse: number;
  // Новые поля для памяти
  memoryContext?: MemoryContext;
  conversationId?: string;
}

export interface BotPersonality {
  patterns: TriggerPattern[];
  responseStyle: {
    averageLength: number;
    commonWords: string[];
    commonEmojis: string[];
    formalityLevel: number; // 0-1
    activityLevel: number; // 0-1 (как часто отвечает)
  };
  schedule: {
    activeHours: number[];
    activeDays: number[];
  };
}