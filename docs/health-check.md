# 🩺 Health Check - Система мониторинга здоровья

## Обзор

Health Check система обеспечивает автоматический мониторинг всех критических компонентов Гейсандра Куловича для стабильной работы в продакшене.

## 🚀 Быстрый старт

### Основные команды:

```bash
# Полная проверка здоровья
bun run health-check

# Быстрая проверка (только критические компоненты)
bun run health-check --quick

# Мониторинг в реальном времени
bun run health-check --watch

# JSON вывод для скриптов автоматизации
bun run health-check --json
```

## 📊 Что проверяется

### 1. **База данных (Database)**
- ✅ Подключение к SQLite
- ✅ Наличие всех таблиц
- ✅ Размер базы данных
- ✅ Время отклика запросов

### 2. **OpenAI API**
- ✅ Доступность API
- ✅ Корректность ключа
- ✅ Настройки модели
- ✅ Время отклика

### 3. **Telegram Bot API**
- ✅ Валидность токена
- ✅ Доступность API
- ✅ Информация о боте
- ✅ Настройки чата

### 4. **Память системы (Memory)**
- ✅ Использование RAM
- ✅ Heap память
- ✅ Время работы процесса
- ✅ Версия Node.js

### 5. **Конфигурация (Config)**
- ✅ Обязательные переменные окружения
- ✅ Корректность значений
- ✅ Доступность файлов
- ✅ Валидация настроек

## 🎯 Статусы здоровья

### 🟢 Healthy (Здоров)
- Все компоненты работают корректно
- Нет предупреждений или ошибок
- Готов к работе в продакшене

### 🟡 Degraded (Ухудшен)
- Есть предупреждения, но система работает
- Некоторые компоненты в состоянии warn
- Требует внимания, но не критично

### 🔴 Unhealthy (Нездоров)
- Критические ошибки в компонентах
- Система может работать нестабильно
- Требует немедленного исправления

## 🔧 Интеграция с ботом

Health check автоматически интегрирован в основной процесс бота:

```typescript
// Автоматическая проверка при запуске
const bot = new DigitalPersonalityBot();
await bot.start(); // Проводит health check

// Программная проверка
const healthStatus = await bot.getHealthStatus();
const quickCheck = await bot.quickHealthCheck();
```

## ⚙️ Настройка порогов

В `.env` файле можно настроить пороги предупреждений:

```bash
# Частота автоматических проверок (минуты)
HEALTH_CHECK_INTERVAL=30

# Пороги использования памяти (MB)
HEALTH_MEMORY_WARNING_MB=500
HEALTH_MEMORY_CRITICAL_MB=1000

# Пороги размера БД (MB)  
HEALTH_DB_WARNING_MB=100
HEALTH_DB_CRITICAL_MB=500
```

## 🚨 Автоматизация и мониторинг

### Для Docker/Kubernetes:

```bash
# Health check endpoint
bun run health-check --quick --json

# Exit codes:
# 0 = healthy
# 1 = degraded  
# 2 = unhealthy
# 3 = error
```

### Для systemd:

```bash
# Создайте сервис проверки
sudo systemctl status geisandr-health.timer
```

### Для cron:

```bash
# Проверка каждые 30 минут
*/30 * * * * cd /path/to/bot && bun run health-check --quick >> /var/log/geisandr-health.log 2>&1
```

## 📱 Примеры использования

### 1. Ежедневная проверка:
```bash
#!/bin/bash
cd /path/to/geisandr
HEALTH=$(bun run health-check --json)
STATUS=$(echo $HEALTH | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
    echo "⚠️ Проблемы с Гейсандром: $STATUS"
    # Отправить уведомление
fi
```

### 2. Мониторинг в продакшене:
```bash
# Непрерывное наблюдение
bun run health-check --watch

# [12:30:15] ✅ healthy: Все системы работают
# [12:30:45] ⚠️ degraded: Высокое использование памяти  
# [12:31:15] ✅ healthy: Память освобождена
```

### 3. CI/CD интеграция:
```yaml
# В GitHub Actions
- name: Health Check
  run: |
    bun run health-check
    if [ $? -ne 0 ]; then
      echo "❌ Health check failed"
      exit 1
    fi
```

## 🔍 Диагностика проблем

### База данных недоступна:
```bash
# Проверьте права доступа
ls -la memory.db

# Проверьте место на диске
df -h
```

### OpenAI API недоступен:
```bash
# Проверьте ключ
echo $OPENAI_API_KEY

# Проверьте квоты
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/usage
```

### Telegram API недоступен:
```bash
# Проверьте токен
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

### Высокое использование памяти:
```bash
# Проверьте процессы
top -p $(pgrep -f "bun.*src/index.ts")

# Анализ памяти
bun run health-check --json | jq '.checks.memory.details'
```

## 🎛️ Расширенные возможности

### Пользовательские проверки:
```typescript
// Добавьте свои проверки в HealthMonitor
private async checkCustomComponent(): Promise<HealthCheck> {
  // Ваша логика проверки
  return {
    status: 'pass',
    message: 'Компонент работает',
    duration: 150
  };
}
```

### Интеграция с внешними системами:
```typescript
// Webhook уведомления
if (healthStatus.status === 'unhealthy') {
  await fetch('https://hooks.slack.com/...', {
    method: 'POST',
    body: JSON.stringify({
      text: `🚨 Гейсандр Кулович нездоров: ${healthStatus.status}`
    })
  });
}
```

## 📈 Метрики производительности

Health check также собирает метрики:
- Время отклика компонентов
- Использование ресурсов
- Частота ошибок
- Время работы системы

Эти данные можно использовать для:
- Оптимизации производительности
- Планирования ресурсов
- Выявления узких мест
- Мониторинга SLA

---

**Результат ЭТАПА 4:** Полная система мониторинга здоровья готова к продакшену! 🩺✅
