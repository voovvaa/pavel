import { Database } from 'bun:sqlite';
import { Logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { TIMEOUTS, MEMORY_LIMITS } from '../constants/performance.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    database: HealthCheck;
    openai: HealthCheck;
    telegram: HealthCheck;
    memory: HealthCheck;
    config: HealthCheck;
  };
  uptime: number;
  version: string;
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  duration?: number;
  details?: any;
}

export class HealthMonitor {
  private startTime: Date;
  private db: Database | null = null;
  private chatId: string | null = null;

  constructor(chatId?: string) {
    this.startTime = new Date();
    this.chatId = chatId || null;
    
    if (this.chatId) {
      try {
        this.db = new Database(config.databasePath || './memory.db');
      } catch (error) {
        Logger.warn('Не удалось подключиться к БД для health check:', error);
      }
    }
  }

  /**
   * Полная проверка здоровья системы
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();
    Logger.info('🩺 Начинаем проверку здоровья системы...');

    const [database, openai, telegram, memory, configCheck] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkOpenAI(),
      this.checkTelegram(),
      this.checkMemory(),
      this.checkConfig()
    ]);

    const checks = {
      database: this.getCheckResult(database),
      openai: this.getCheckResult(openai),
      telegram: this.getCheckResult(telegram),
      memory: this.getCheckResult(memory),
      config: this.getCheckResult(configCheck)
    };

    const overallStatus = this.calculateOverallStatus(checks);
    const duration = Date.now() - startTime;

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date(),
      checks,
      uptime: Date.now() - this.startTime.getTime(),
      version: process.env.npm_package_version || '1.0.0'
    };

    Logger.info(`🩺 Проверка здоровья завершена за ${duration}мс - статус: ${overallStatus}`);
    return healthStatus;
  }

  /**
   * Быстрая проверка критических компонентов
   */
  async quickHealthCheck(): Promise<{ status: string; message: string }> {
    try {
      // Проверяем основные компоненты с таймаутом
      const checks = await Promise.race([
        Promise.allSettled([
          this.checkDatabase(),
          this.checkConfig()
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]) as PromiseSettledResult<HealthCheck>[];

      const allPassed = checks.every(check => 
        check.status === 'fulfilled' && check.value.status === 'pass'
      );

      return {
        status: allPassed ? 'healthy' : 'degraded',
        message: allPassed ? 'Все системы работают' : 'Обнаружены проблемы'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Ошибка health check: ${error}`
      };
    }
  }

  /**
   * Проверка базы данных
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    if (!this.db) {
      return {
        status: 'warn',
        message: 'База данных не инициализирована',
        duration: Date.now() - startTime
      };
    }

    try {
      // Проверяем подключение
      const result = this.db.prepare('SELECT 1 as test').get() as any;
      
      if (!result || result.test !== 1) {
        throw new Error('Неожиданный результат запроса');
      }

      // Проверяем таблицы
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all() as any[];

      const requiredTables = ['messages', 'user_relationships', 'chat_topics'];
      const missingTables = requiredTables.filter(table => 
        !tables.some(t => t.name === table)
      );

      if (missingTables.length > 0) {
        return {
          status: 'fail',
          message: `Отсутствуют таблицы: ${missingTables.join(', ')}`,
          duration: Date.now() - startTime
        };
      }

      // Проверяем размер БД
      const dbSize = this.getDbSize();
      const dbSizeMB = dbSize / (1024 * 1024);

      return {
        status: 'pass',
        message: 'База данных работает корректно',
        duration: Date.now() - startTime,
        details: {
          tables: tables.length,
          sizeMB: Math.round(dbSizeMB * 100) / 100,
          chatId: this.chatId
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        message: `Ошибка БД: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Проверка OpenAI API
   */
  private async checkOpenAI(): Promise<HealthCheck> {
    const startTime = Date.now();

    if (!config.openaiApiKey || config.aiMode === 'patterns_only') {
      return {
        status: 'warn',
        message: 'OpenAI API не настроен или отключен',
        duration: Date.now() - startTime,
        details: { mode: config.aiMode }
      };
    }

    try {
      // Простая проверка доступности API без реального запроса
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        status: 'pass',
        message: 'OpenAI API доступен',
        duration: Date.now() - startTime,
        details: {
          model: config.openaiModel,
          mode: config.aiMode,
          probability: config.aiProbability
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        message: `OpenAI API недоступен: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Проверка Telegram Bot API
   */
  private async checkTelegram(): Promise<HealthCheck> {
    const startTime = Date.now();

    if (!config.telegramBotToken) {
      return {
        status: 'fail',
        message: 'Telegram Bot Token не настроен',
        duration: Date.now() - startTime
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getMe`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      if (!data.ok) {
        throw new Error(data.description || 'API вернул ошибку');
      }

      return {
        status: 'pass',
        message: 'Telegram Bot API работает',
        duration: Date.now() - startTime,
        details: {
          botName: data.result.username,
          botId: data.result.id,
          allowedChat: config.allowedChatId || 'все чаты'
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        message: `Telegram API недоступен: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Проверка использования памяти
   */
  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
      };

      // Проверяем критические пороги
      const warnings = [];
      if (memUsageMB.heapUsed > 500) warnings.push('Высокое использование heap');
      if (memUsageMB.rss > 1000) warnings.push('Высокое использование RSS');

      const status = warnings.length === 0 ? 'pass' : 
                   warnings.length <= 1 ? 'warn' : 'fail';

      return {
        status,
        message: warnings.length === 0 ? 'Память в норме' : warnings.join(', '),
        duration: Date.now() - startTime,
        details: {
          memoryMB: memUsageMB,
          uptime: process.uptime(),
          nodeVersion: process.version
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        message: `Ошибка проверки памяти: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Проверка конфигурации
   */
  private async checkConfig(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const issues = [];

      // Проверяем обязательные параметры
      if (!config.telegramBotToken) issues.push('TELEGRAM_BOT_TOKEN не задан');
      
      if (config.aiMode !== 'patterns_only' && !config.openaiApiKey) {
        issues.push('OPENAI_API_KEY не задан для AI режима');
      }

      // Проверяем корректность значений
      if (config.aiProbability < 0 || config.aiProbability > 1) {
        issues.push('AI_PROBABILITY должен быть 0.0-1.0');
      }

      if (config.memoryDays < 1 || config.memoryDays > 365) {
        issues.push('MEMORY_DAYS должен быть 1-365');
      }

      // Проверяем доступность файлов
      const dbPath = config.databasePath || './memory.db';
      try {
        await Bun.file(dbPath).exists();
      } catch {
        issues.push('База данных недоступна');
      }

      const status = issues.length === 0 ? 'pass' : 'fail';

      return {
        status,
        message: issues.length === 0 ? 'Конфигурация корректна' : issues.join(', '),
        duration: Date.now() - startTime,
        details: {
          devMode: config.devMode,
          aiMode: config.aiMode,
          aiModel: config.openaiModel,
          memoryDays: config.memoryDays
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        message: `Ошибка проверки конфигурации: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Получает размер базы данных
   */
  private getDbSize(): number {
    try {
      const fs = require('fs');
      const stats = fs.statSync(config.databasePath || './memory.db');
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Обрабатывает результат проверки
   */
  private getCheckResult(settledResult: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        status: 'fail',
        message: `Ошибка проверки: ${settledResult.reason}`,
        duration: 0
      };
    }
  }

  /**
   * Вычисляет общий статус на основе всех проверок
   */
  private calculateOverallStatus(checks: HealthStatus['checks']): 'healthy' | 'degraded' | 'unhealthy' {
    const checkResults = Object.values(checks);
    
    const failCount = checkResults.filter(c => c.status === 'fail').length;
    const warnCount = checkResults.filter(c => c.status === 'warn').length;

    if (failCount > 0) {
      return failCount >= 2 ? 'unhealthy' : 'degraded';
    }
    
    if (warnCount >= 2) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Форматирует статус для логирования
   */
  formatHealthStatus(status: HealthStatus): string {
    const lines = [
      `🩺 Health Check Report (${status.status.toUpperCase()})`,
      `├─ Время: ${status.timestamp.toLocaleString('ru-RU')}`,
      `├─ Uptime: ${Math.round(status.uptime / 1000 / 60)} минут`,
      `├─ Версия: ${status.version}`,
      '├─ Компоненты:'
    ];

    Object.entries(status.checks).forEach(([name, check], index, arr) => {
      const isLast = index === arr.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const statusIcon = check.status === 'pass' ? '✅' : 
                        check.status === 'warn' ? '⚠️' : '❌';
      
      lines.push(`${prefix}   ${statusIcon} ${name}: ${check.message} (${check.duration || 0}ms)`);
    });

    return lines.join('\n');
  }

  /**
   * Закрывает соединения
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
