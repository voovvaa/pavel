# 🔄 CI/CD Setup для Гейсандра Куловича

## Обзор

Автоматизированная система развертывания включает:
- **🧪 Тестирование** - TypeScript проверки и health checks
- **🐳 Docker сборка** - Multi-platform образы в GHCR
- **🚀 Автодеплой** - На Synology NAS через SSH
- **🩺 Мониторинг** - Health checks и уведомления
- **📦 Релизы** - Семантическое версионирование

## Настройка GitHub Repository

### 1. Secrets конфигурация

В Settings → Secrets and variables → Actions добавить:

```
SYNOLOGY_HOST=192.168.1.100              # IP адрес NAS
SYNOLOGY_USER=admin                      # SSH пользователь
SYNOLOGY_SSH_KEY=-----BEGIN OPENSSH...   # SSH приватный ключ
TELEGRAM_BOT_TOKEN=123456789:ABC...      # Токен бота
OPENAI_API_KEY=sk-...                    # OpenAI API ключ
ALLOWED_CHAT_ID=-1001234567890           # ID чата
```

### 2. Environments конфигурация

Создать environment `production` в Settings → Environments:
- ✅ Required reviewers (опционально)
- ✅ Wait timer: 0 minutes
- ✅ Environment secrets (использует общие secrets)

### 3. GitHub Container Registry

```bash
# Включить GHCR в Settings → Actions → General
# Permissions → Read and write permissions ✅
```

## Synology NAS Подготовка

### 1. SSH настройка

```bash
# Включить SSH в Control Panel → Terminal & SNMP → SSH ✅
# Порт: 22 (или свой)

# Создать SSH ключ локально
ssh-keygen -t ed25519 -C "github-actions@geysandr-bot"

# Скопировать публичный ключ на NAS
ssh-copy-id -i ~/.ssh/id_ed25519.pub admin@192.168.1.100

# Приватный ключ добавить в GitHub Secrets
cat ~/.ssh/id_ed25519  # → SYNOLOGY_SSH_KEY
```

### 2. Docker установка

```bash
# Package Center → Install Docker
# Package Center → Install Container Manager

# Создать директорию проекта
mkdir -p /volume1/docker/geysandr-bot
chmod 755 /volume1/docker/geysandr-bot
```

### 3. Системные требования

**Minimum:**
- RAM: 1GB
- Storage: 5GB
- CPU: 1 core

**Recommended:**
- RAM: 2GB+ 
- Storage: 10GB+
- CPU: 2+ cores

## Workflows Overview

### 🚀 `deploy.yml` - Основной деплой

**Триггеры:**
- Push в `main` branch
- Pull Request в `main`
- Manual dispatch с опцией retrain

**Этапы:**
1. **Test** - Type checking + health check
2. **Build** - Docker multi-platform сборка → GHCR
3. **Deploy** - SSH деплой на NAS с docker-compose
4. **Retrain** - Переобучение личности (опционально)
5. **Notify** - Telegram уведомления

### 🩺 `health-check.yml` - Мониторинг

**Триггеры:**
- Cron: каждый час
- Manual dispatch с deep check опцией

**Функции:**
- Health status проверка
- Автоматический restart при сбоях
- Resource monitoring
- Еженедельная очистка (воскресенье 00:00)

### 📦 `release.yml` - Управление релизами

**Триггеры:**
- Push тега `v*.*.*`
- Manual dispatch

**Функции:**
- Генерация changelog
- GitHub Release создание
- Tagged Docker images
- Production деплой stable версии

## Использование

### Обычный деплой

```bash
# Просто push в main
git add .
git commit -m "feature: новая функциональность"
git push origin main
# → Автоматический деплой через 2-3 минуты
```

### Деплой с переобучением

```bash
# Обновить данные чата
cp /path/to/new/result.json chat/
git add chat/result.json
git commit -m "data: обновлены данные чата [retrain]"
git push origin main
# → Деплой + переобучение личности
```

### Создание релиза

```bash
# Создать и push тег
git tag v1.2.3
git push origin v1.2.3
# → Автоматический релиз + деплой

# Или через GitHub Actions UI
# Actions → Release Management → Run workflow
# Version: v1.2.3, Pre-release: false
```

### Manual деплой

```bash
# Через GitHub Actions UI
# Actions → Deploy → Run workflow
# Branch: main, Retrain: true/false
```

## Мониторинг

### Health Check статусы

- **🟢 healthy** - Все системы работают
- **🟡 degraded** - Есть предупреждения, но работает
- **🔴 unhealthy** - Критические ошибки, нужен restart

### Telegram уведомления

Бот автоматически отправляет уведомления о:
- ✅/❌ Статусе деплоя
- 🩺 Health check результатах
- 📦 Новых релизах
- 🧹 Еженедельной очистке

### Логи и мониторинг

```bash
# Просмотр логов деплоя
ssh admin@192.168.1.100
cd /volume1/docker/geysandr-bot
docker compose logs -f geysandr-bot

# Health check вручную
docker compose exec geysandr-bot bun run health-check

# Статистика ресурсов
docker stats geysandr-kylovich-bot
```

## Troubleshooting

### Деплой не проходит

1. **Проверить SSH соединение:**
   ```bash
   ssh -T admin@192.168.1.100
   ```

2. **Проверить Secrets:**
   - Actions → Last failed run → Re-run failed jobs
   - Проверить все required secrets установлены

3. **Проверить NAS ресурсы:**
   ```bash
   ssh admin@192.168.1.100
   df -h  # Свободное место
   free -h  # RAM
   docker system df  # Docker использование
   ```

### Health Check неуспешен

1. **Проверить логи контейнера:**
   ```bash
   docker compose logs --tail=50 geysandr-bot
   ```

2. **Проверить переменные окружения:**
   ```bash
   docker compose exec geysandr-bot env | grep -E "TOKEN|KEY"
   ```

3. **Ручной health check:**
   ```bash
   docker compose exec geysandr-bot bun run health-check --json
   ```

### Контейнер не запускается

1. **Проверить образ:**
   ```bash
   docker pull ghcr.io/username/geysandr-bot:latest
   docker images | grep geysandr
   ```

2. **Проверить ports и volumes:**
   ```bash
   docker compose config
   docker volume ls | grep geysandr
   ```

3. **Restart с пересборкой:**
   ```bash
   docker compose down
   docker compose pull
   docker compose up -d --force-recreate
   ```

## Security Best Practices

### SSH ключи
- ✅ Используйте ED25519 ключи
- ✅ Ключи только для GitHub Actions
- ✅ Регулярно ротируйте ключи (6 месяцев)

### Secrets управление
- ✅ Все токены в GitHub Secrets
- ✅ Environment protection для production
- ✅ Принцип минимальных прав

### Docker безопасность
- ✅ Non-root пользователь в контейнере
- ✅ Read-only filesystem где возможно
- ✅ Регулярные обновления базового образа

## Performance Optimization

### Docker сборка
- ✅ Multi-stage build для уменьшения размера
- ✅ Кэширование GitHub Actions
- ✅ Build cache оптимизация

### Деплой скорость
- ✅ Parallel job execution
- ✅ Incremental updates
- ✅ Health check timeouts

### Мониторинг ресурсов
- ✅ Memory limits в docker-compose
- ✅ CPU limits
- ✅ Storage monitoring

---

🎯 **Результат**: Полностью автоматизированный CI/CD pipeline с мониторингом, уведомлениями и safety measures для production-ready развертывания Гейсандра Куловича.