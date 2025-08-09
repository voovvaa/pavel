export class Logger {
  private static formatTime(): string {
    return new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour12: false
    });
  }

  static info(message: string, data?: any): void {
    console.log(`[${this.formatTime()}] INFO: ${message}`, data ? data : '');
  }

  static error(message: string, error?: any): void {
    console.error(`[${this.formatTime()}] ERROR: ${message}`, error ? error : '');
  }

  static debug(message: string, data?: any): void {
    console.log(`[${this.formatTime()}] DEBUG: ${message}`, data ? data : '');
  }

  static warn(message: string, data?: any): void {
    console.warn(`[${this.formatTime()}] WARN: ${message}`, data ? data : '');
  }
}