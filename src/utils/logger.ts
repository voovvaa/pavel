// Типы логов
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Конфигурация логгера
interface LoggerConfig {
  level: LogLevel;
  showTimestamps: boolean;
  showSource: boolean;
}

export class Logger {
  private static config: LoggerConfig = {
    level: (process.env.DEV_MODE === 'true') ? 'debug' : 'info',
    showTimestamps: true,
    showSource: false
  };

  private static logLevels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  private static formatTime(): string {
    return new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour12: false
    });
  }

  private static shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private static formatMessage(level: LogLevel, message: string, data?: any): string {
    let formatted = '';
    
    if (this.config.showTimestamps) {
      formatted += `[${this.formatTime()}] `;
    }
    
    formatted += `${level.toUpperCase()}: ${message}`;
    
    if (data !== undefined) {
      formatted += ` ${typeof data === 'object' ? JSON.stringify(data) : data}`;
    }
    
    return formatted;
  }

  static info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  static error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, error));
    }
  }

  static debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  static warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  // Новые методы для специальных случаев
  static performance(operation: string, duration: number): void {
    this.debug(`⏱️ [PERF] ${operation} завершено за ${duration}мс`);
  }

  static memory(event: string, details?: string): void {
    this.debug(`💾 [MEM] ${event}${details ? ': ' + details : ''}`);
  }

  static ai(event: string, details?: string): void {
    this.debug(`🤖 [AI] ${event}${details ? ': ' + details : ''}`);
  }

  // Методы конфигурации
  static setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  static setShowTimestamps(show: boolean): void {
    this.config.showTimestamps = show;
  }

  static getConfig(): LoggerConfig {
    return { ...this.config };
  }
}