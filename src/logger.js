export class Logger {
    static formatTime() {
        return new Date().toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            hour12: false
        });
    }
    static info(message, data) {
        console.log(`[${this.formatTime()}] INFO: ${message}`, data ? data : '');
    }
    static error(message, error) {
        console.error(`[${this.formatTime()}] ERROR: ${message}`, error ? error : '');
    }
    static debug(message, data) {
        console.log(`[${this.formatTime()}] DEBUG: ${message}`, data ? data : '');
    }
    static warn(message, data) {
        console.warn(`[${this.formatTime()}] WARN: ${message}`, data ? data : '');
    }
}
