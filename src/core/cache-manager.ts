import { Logger } from '../utils/logger.js';
import { TIMEOUTS, MEMORY_LIMITS } from '../constants/performance.js';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccess: number;
}

export interface CacheStats {
  totalEntries: number;
  memoryUsage: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * Умная система кэширования с TTL, LRU и статистикой
 */
export class SmartCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    cleanups: 0
  };

  constructor(maxSize: number = 1000, defaultTTL: number = 30 * 60 * 1000) { // 30 минут по умолчанию
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    
    // Автоматическая очистка каждые 5 минут
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Получить значение из кэша
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Проверяем TTL
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Обновляем статистику доступа
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.stats.hits++;

    return entry.data;
  }

  /**
   * Сохранить значение в кэш
   */
  set(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const actualTTL = ttl || this.defaultTTL;

    // Проверяем размер кэша
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: actualTTL,
      accessCount: 1,
      lastAccess: now
    };

    this.cache.set(key, entry);
  }

  /**
   * Удалить запись из кэша
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Проверить наличие ключа в кэше
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Проверяем TTL
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Получить или вычислить значение (cache-aside pattern)
   */
  async getOrCompute<R = T>(
    key: string, 
    computeFn: () => Promise<R> | R, 
    ttl?: number
  ): Promise<R> {
    const cached = this.get(key) as R;
    if (cached !== null) {
      return cached;
    }

    const computed = await computeFn();
    this.set(key, computed as unknown as T, ttl);
    return computed;
  }

  /**
   * Удаляет наименее используемую запись (LRU)
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      Logger.debug(`🗑️ Cache evicted LRU entry: ${oldestKey}`);
    }
  }

  /**
   * Очистка просроченных записей
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.cleanups++;
      Logger.debug(`🧹 Cache cleanup: удалено ${cleaned} просроченных записей`);
    }
  }

  /**
   * Полная очистка кэша
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, cleanups: 0 };
  }

  /**
   * Получить статистику кэша
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? this.stats.hits / (this.stats.hits + this.stats.misses) 
      : 0;

    // Приблизительный размер в памяти
    const memoryUsage = this.cache.size * 1024; // Примерная оценка

    return {
      totalEntries: this.cache.size,
      memoryUsage,
      hitRate: Math.round(hitRate * 100) / 100,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0
    };
  }

  /**
   * Получить подробную статистику
   */
  getDetailedStats(): any {
    const stats = this.getStats();
    return {
      ...stats,
      evictions: this.stats.evictions,
      cleanups: this.stats.cleanups,
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      topKeys: this.getTopKeys(5)
    };
  }

  /**
   * Получить наиболее используемые ключи
   */
  private getTopKeys(limit: number = 5): Array<{key: string, accessCount: number, lastAccess: Date}> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        lastAccess: new Date(entry.lastAccess)
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries;
  }

  /**
   * Получить размер кэша
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Предварительно прогреть кэш
   */
  async warmup(entries: Array<{key: string, value: T, ttl?: number}>): Promise<void> {
    Logger.info(`🔥 Прогрев кэша: ${entries.length} записей`);
    
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
    
    Logger.info(`✅ Кэш прогрет: ${this.cache.size} записей`);
  }
}

/**
 * Глобальный менеджер кэшей
 */
export class CacheManager {
  private caches = new Map<string, SmartCache>();
  private defaultConfig = {
    memory: { maxSize: 500, ttl: 30 * 60 * 1000 }, // 30 минут
    ai: { maxSize: 100, ttl: 10 * 60 * 1000 },     // 10 минут
    images: { maxSize: 50, ttl: 60 * 60 * 1000 },  // 1 час
    profiles: { maxSize: 200, ttl: 2 * 60 * 60 * 1000 }, // 2 часа
    topics: { maxSize: 300, ttl: 60 * 60 * 1000 },       // 1 час
    events: { maxSize: 100, ttl: 24 * 60 * 60 * 1000 }   // 24 часа
  };

  /**
   * Получить или создать кэш
   */
  getCache<T>(name: string): SmartCache<T> {
    if (!this.caches.has(name)) {
      const config = this.defaultConfig[name as keyof typeof this.defaultConfig] || 
                    this.defaultConfig.memory;
      
      const cache = new SmartCache<T>(config.maxSize, config.ttl);
      this.caches.set(name, cache);
      Logger.debug(`📦 Создан кэш "${name}" (размер: ${config.maxSize}, TTL: ${config.ttl}ms)`);
    }

    return this.caches.get(name) as SmartCache<T>;
  }

  /**
   * Получить статистику всех кэшей
   */
  getAllStats(): { [cacheName: string]: CacheStats } {
    const stats: { [cacheName: string]: CacheStats } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }

    return stats;
  }

  /**
   * Очистить все кэши
   */
  clearAll(): void {
    for (const [name, cache] of this.caches.entries()) {
      cache.clear();
      Logger.info(`🧹 Очищен кэш "${name}"`);
    }
  }

  /**
   * Принудительная очистка всех кэшей
   */
  cleanup(): void {
    for (const cache of this.caches.values()) {
      cache.cleanup();
    }
  }

  /**
   * Получить общую статистику использования памяти
   */
  getMemoryUsage(): { totalCaches: number, totalEntries: number, estimatedMemory: number } {
    let totalEntries = 0;
    let estimatedMemory = 0;

    for (const cache of this.caches.values()) {
      const stats = cache.getStats();
      totalEntries += stats.totalEntries;
      estimatedMemory += stats.memoryUsage;
    }

    return {
      totalCaches: this.caches.size,
      totalEntries,
      estimatedMemory
    };
  }
}

// Глобальный экземпляр менеджера кэшей
export const cacheManager = new CacheManager();
