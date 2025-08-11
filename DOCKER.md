# 🐳 Docker Deployment для Гейсандра Куловича

## Быстрый старт

### 1. Настройка окружения
```bash
# Копируем шаблон конфигурации
cp .env.docker.example .env.docker

# Редактируем и заполняем переменные
nano .env.docker
```

### 2. Деплой одной командой
```bash
# Полный автоматический деплой
bun run docker:deploy

# Или используя скрипт напрямую
./scripts/deploy.sh
```

## Детальные команды

### Сборка и запуск
```bash
# Собрать образ
bun run docker:build

# Запустить контейнеры
bun run docker:up

# Остановить контейнеры  
bun run docker:down

# Смотреть логи в реальном времени
bun run docker:logs
```

### Управление
```bash
# Обновление без остановки сервиса
bun run docker:update

# Создание бэкапа
bun run docker:backup

# Health check внутри контейнера
docker compose exec geysandr-bot bun run health-check
```

## Структура контейнера

### Важные пути
- `/app/data/memory.db` - база данных памяти
- `/app/logs/` - логи бота
- `/app/chat/result_personality.json` - файл личности

### Volumes
- `geysandr_bot_data` - данные памяти (SQLite)
- `geysandr_bot_logs` - логи работы

### Ресурсы
- **CPU**: 0.5-1.0 ядра
- **RAM**: 256-512 MB
- **Storage**: ~50MB образ + данные

## Synology NAS настройки

### Установка Docker
1. Package Center → Install Docker
2. Package Center → Install Container Manager

### SSH доступ
```bash
# Подключение к NAS
ssh admin@your-synology-ip

# Переход в директорию проекта
cd /volume1/docker/geysandr-bot
```

### Автозапуск
```bash
# Добавить в crontab для автозапуска после перезагрузки
@reboot cd /volume1/docker/geysandr-bot && docker compose up -d
```

## Мониторинг

### Health Checks
Контейнер автоматически проверяет здоровье каждые 60 секунд:
- ✅ **healthy** - все компоненты работают
- ⚠️ **degraded** - есть предупреждения
- ❌ **unhealthy** - критические ошибки

### Просмотр статуса
```bash
# Статус контейнеров
docker compose ps

# Детальная информация
docker compose exec geysandr-bot bun run health-check

# Статистика ресурсов
docker stats geysandr-kylovich-bot
```

### Логи
```bash
# Последние 50 строк
docker compose logs --tail=50 geysandr-bot

# Логи в реальном времени
docker compose logs -f geysandr-bot

# Логи с временными метками
docker compose logs -t geysandr-bot
```

## Обновления

### Автоматическое обновление
```bash
# Скрипт обновления включает:
# - Бэкап данных
# - Получение новых изменений
# - Переобучение бота (если нужно)
# - Graceful restart
./scripts/update.sh
```

### Ручное обновление
```bash
# 1. Остановить бота
docker compose down

# 2. Получить изменения
git pull

# 3. Пересобрать образ
docker compose build --no-cache

# 4. Запустить
docker compose up -d
```

## Бэкапы

### Автоматический бэкап
```bash
# Создает архив с:
# - memory.db (база памяти)
# - result_personality.json (личность)
# - Конфигурационные файлы
./scripts/backup.sh
```

### Восстановление из бэкапа
```bash
# Распаковать архив
tar -xzf backups/20241201_143022.tar.gz

# Скопировать базу памяти
docker compose cp backups/20241201_143022/memory.db geysandr-bot:/app/data/

# Перезапустить
docker compose restart geysandr-bot
```

## Troubleshooting

### Контейнер не запускается
```bash
# Проверить логи сборки
docker compose logs geysandr-bot

# Проверить переменные окружения
docker compose exec geysandr-bot env | grep -E "TOKEN|KEY|OPENAI"

# Проверить файловую систему
docker compose exec geysandr-bot ls -la /app/data/
```

### Проблемы с памятью
```bash
# Подключиться к контейнеру
docker compose exec geysandr-bot bash

# Проверить базу данных
bun run memory-stats

# Очистить кэш
bun run cache-stats
```

### Высокое потребление ресурсов
```bash
# Мониторинг ресурсов
docker stats geysandr-kylovich-bot

# Уменьшить лимиты в docker-compose.yml
# или настроить AI_PROBABILITY в .env.docker
```

## Безопасность

### Рекомендации
- ✅ Контейнер работает от непривилегированного пользователя
- ✅ Секреты через переменные окружения
- ✅ Данные в именованных volume (изоляция)
- ✅ Health checks для мониторинга
- ✅ Логирование ограничено (50MB, 3 файла)

### Обновления безопасности
```bash
# Регулярно обновляйте базовый образ Bun
docker pull oven/bun:1.2-slim

# Пересобирайте образ
docker compose build --no-cache --pull
```

## Production Checklist

- [ ] `.env.docker` настроен с реальными токенами
- [ ] `result_personality.json` актуальна
- [ ] Docker daemon запущен на NAS
- [ ] Настроены автоматические бэкапы
- [ ] Мониторинг health checks
- [ ] Логи ротируются
- [ ] Обновления контейнера по расписанию