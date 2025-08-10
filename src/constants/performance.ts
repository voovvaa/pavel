/**
 * Константы для производительности и кэширования
 */

// Таймауты для различных операций
export const TIMEOUTS = {
  AI_GENERATION: 60000,           // 60 секунд для AI генерации
  IMAGE_DOWNLOAD: 30000,          // 30 секунд для загрузки изображений  
  IMAGE_ANALYSIS: 45000,          // 45 секунд для анализа изображений
  DATABASE_QUERY: 10000,          // 10 секунд для SQL запросов
  HEALTH_CHECK: 30000,            // 30 секунд для health check
  CACHE_CLEANUP: 5000,            // 5 секунд для очистки кэша
  MEMORY_ANALYSIS: 15000,         // 15 секунд для анализа памяти
  EMOTIONAL_ANALYSIS: 5000        // 5 секунд для эмоционального анализа
} as const;

// Лимиты памяти
export const MEMORY_LIMITS = {
  MAX_CACHE_SIZE_MB: 100,         // 100 МБ максимум для всех кэшей
  MAX_MESSAGE_LENGTH: 4000,       // Максимальная длина сообщения
  MAX_CONTEXT_MESSAGES: 50,       // Максимум сообщений в контексте
  MAX_RELEVANT_HISTORY: 10,       // Максимум релевантных сообщений
  MAX_TOPICS: 20,                 // Максимум активных тем
  MAX_EVENTS: 100,                // Максимум событий в памяти
  MAX_USER_PROFILES: 200,         // Максимум профилей пользователей
  WARNING_MEMORY_MB: 500,         // Предупреждение при использовании памяти
  CRITICAL_MEMORY_MB: 1000        // Критическое использование памяти
} as const;

// Настройки кэширования
export const CACHE_CONFIG = {
  // TTL для разных типов данных (в миллисекундах)
  TTL: {
    AI_RESPONSES: 5 * 60 * 1000,        // 5 минут для AI ответов
    MEMORY_QUERIES: 2 * 60 * 1000,      // 2 минуты для запросов памяти
    USER_PROFILES: 10 * 60 * 1000,      // 10 минут для профилей пользователей
    TOPICS: 5 * 60 * 1000,              // 5 минут для тем
    EMOTIONAL_PROFILES: 30 * 60 * 1000, // 30 минут для эмоциональных профилей
    EVENTS: 60 * 60 * 1000,             // 1 час для событий
    IMAGES: 2 * 60 * 60 * 1000          // 2 часа для анализа изображений
  },
  
  // Размеры кэшей (количество записей)
  SIZES: {
    AI_RESPONSES: 100,           // 100 AI ответов
    MEMORY_QUERIES: 500,         // 500 запросов памяти
    USER_PROFILES: 200,          // 200 профилей пользователей
    TOPICS: 300,                 // 300 тем
    EMOTIONAL_PROFILES: 200,     // 200 эмоциональных профилей
    EVENTS: 100,                 // 100 событий
    IMAGES: 50                   // 50 анализов изображений
  },
  
  // Интервалы очистки (в миллисекундах)
  CLEANUP_INTERVALS: {
    AUTOMATIC: 5 * 60 * 1000,    // Автоматическая очистка каждые 5 минут
    FORCED: 30 * 60 * 1000,      // Принудительная очистка каждые 30 минут
    HEALTH_CHECK: 10 * 60 * 1000 // Проверка здоровья кэшей каждые 10 минут
  }
} as const;

// Пороги производительности
export const PERFORMANCE_THRESHOLDS = {
  // Hit rate (коэффициент попаданий в кэш)
  HIT_RATE: {
    EXCELLENT: 0.8,              // Отличный hit rate (80%+)
    GOOD: 0.6,                   // Хороший hit rate (60%+)
    ACCEPTABLE: 0.4,             // Приемлемый hit rate (40%+)
    POOR: 0.2                    // Плохой hit rate (меньше 20%)
  },
  
  // Время отклика (в миллисекундах)
  RESPONSE_TIME: {
    FAST: 100,                   // Быстрый ответ (менее 100мс)
    NORMAL: 500,                 // Нормальный ответ (менее 500мс)
    SLOW: 2000,                  // Медленный ответ (менее 2с)
    TIMEOUT: 10000               // Таймаут (более 10с)
  },
  
  // Использование памяти (в процентах от лимита)
  MEMORY_USAGE: {
    LOW: 0.3,                    // Низкое использование (менее 30%)
    NORMAL: 0.6,                 // Нормальное использование (менее 60%)
    HIGH: 0.8,                   // Высокое использование (менее 80%)
    CRITICAL: 0.95               // Критическое использование (более 95%)
  }
} as const;

// Настройки логирования производительности
export const PERFORMANCE_LOGGING = {
  // Включить логирование для операций медленнее чем (мс)
  LOG_SLOW_OPERATIONS_MS: 1000,
  
  // Логировать статистику кэша каждые N операций
  LOG_CACHE_STATS_EVERY: 100,
  
  // Логировать memory usage каждые N минут
  LOG_MEMORY_EVERY_MINUTES: 10,
  
  // Детальное логирование в dev режиме
  DETAILED_DEV_LOGGING: true
} as const;

// Rate limiting
export const RATE_LIMITS = {
  // AI запросы
  AI_REQUESTS_PER_MINUTE: 30,      // 30 AI запросов в минуту
  AI_REQUESTS_PER_HOUR: 300,       // 300 AI запросов в час
  
  // Анализ изображений  
  IMAGE_ANALYSIS_PER_USER_MINUTE: 2,  // 2 анализа изображений в минуту на пользователя
  IMAGE_ANALYSIS_PER_HOUR: 50,        // 50 анализов изображений в час
  
  // Эмоциональный анализ
  EMOTION_ANALYSIS_PER_MINUTE: 20,    // 20 эмоциональных анализов в минуту
  
  // Health checks
  HEALTH_CHECKS_PER_MINUTE: 6         // 6 health check'ов в минуту (каждые 10 секунд)
} as const;

// Настройки оптимизации
export const OPTIMIZATION = {
  // Батчинг операций
  BATCH_SIZE: {
    DATABASE_OPERATIONS: 50,     // Группировать до 50 DB операций
    CACHE_OPERATIONS: 20,        // Группировать до 20 cache операций
    MEMORY_CLEANUP: 100          // Очищать до 100 записей за раз
  },
  
  // Приоритеты операций
  PRIORITY: {
    REAL_TIME_RESPONSE: 1,       // Ответы в реальном времени
    CACHE_LOOKUP: 2,             // Поиск в кэше
    DATABASE_READ: 3,            // Чтение из БД
    AI_GENERATION: 4,            // Генерация AI
    BACKGROUND_CLEANUP: 5,       // Фоновая очистка
    ANALYTICS: 6                 // Аналитика
  },
  
  // Стратегии кэширования
  CACHE_STRATEGY: {
    AGGRESSIVE: 'aggressive',    // Агрессивное кэширование (больше памяти, быстрее)
    BALANCED: 'balanced',        // Сбалансированное (умеренная память и скорость)
    CONSERVATIVE: 'conservative' // Консервативное (меньше памяти, медленнее)
  }
} as const;

// Дополнительные константы для совместимости
export const IMPORTANCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.2,
  MEDIUM_IMPORTANCE: 0.5,
  LOW_IMPORTANCE: 0.2
} as const;

export const CONTENT_LIMITS = {
  RECENT_MESSAGES: 5,
  MAX_TOPICS: 10,
  MAX_EVENTS: 3,
  MIN_ENTITY_LENGTH: 3,
  MAX_ENTITIES_PER_MESSAGE: 5,
  MAX_TOPICS_PER_MESSAGE: 3
} as const;

// Экспорт типов для TypeScript
export type TimeoutKey = keyof typeof TIMEOUTS;
export type MemoryLimitKey = keyof typeof MEMORY_LIMITS;
export type CacheConfigKey = keyof typeof CACHE_CONFIG;
export type PerformanceThresholdKey = keyof typeof PERFORMANCE_THRESHOLDS;
export type RateLimitKey = keyof typeof RATE_LIMITS;
export type OptimizationKey = keyof typeof OPTIMIZATION;
