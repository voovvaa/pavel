# 🏠 Synology NAS Setup для Гейсандра Куловича

## Предварительные требования

### Железо
- **NAS модель**: DS218+, DS220+, DS723+ или выше
- **RAM**: Минимум 2GB, рекомендуется 4GB+
- **Свободное место**: Минимум 5GB для бота + 10GB для данных

### DSM версия
- **DSM 7.0** или выше
- **Docker Package** установлен

## Шаг 1: Базовая настройка NAS

### 1.1 Включить SSH доступ

```bash
# Control Panel → Terminal & SNMP → SSH
# ✅ Enable SSH service
# Port: 22 (по умолчанию, или изменить)
```

### 1.2 Настроить пользователя

```bash
# Control Panel → User & Group
# Создать пользователя для GitHub Actions (опционально)
# Или использовать admin с SSH ключами
```

### 1.3 Создать структуру папок

```bash
# File Station или SSH:
mkdir -p /volume1/docker/geysandr-bot
mkdir -p /volume1/docker/geysandr-bot/data
mkdir -p /volume1/docker/geysandr-bot/logs
mkdir -p /volume1/docker/geysandr-bot/chat
mkdir -p /volume1/docker/geysandr-bot/backups
```

## Шаг 2: Docker установка и настройка

### 2.1 Установить Docker

```bash
# Package Center → Search "Docker"
# Install Docker (официальный пакет Synology)
```

### 2.2 Установить Container Manager (опционально)

```bash
# Package Center → Search "Container Manager"  
# Install для GUI управления (удобно для мониторинга)
```

### 2.3 Проверить Docker

```bash
# SSH в NAS
ssh admin@YOUR_NAS_IP

# Проверить Docker
docker --version
# Docker version 20.10.x

docker info
# Должен показать информацию о системе
```

## Шаг 3: SSH ключи для CI/CD

### 3.1 Сгенерировать SSH ключи на рабочем компьютере

```bash
# Генерируем специальный ключ для GitHub Actions
ssh-keygen -t ed25519 -f ~/.ssh/synology_github_actions -C "github-actions@geysandr-bot"

# Получаем публичный ключ
cat ~/.ssh/synology_github_actions.pub

# Получаем приватный ключ для GitHub Secrets
cat ~/.ssh/synology_github_actions
```

### 3.2 Настроить SSH доступ на NAS

```bash
# Подключиться к NAS
ssh admin@YOUR_NAS_IP

# Создать .ssh директорию (если нет)
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Добавить публичный ключ
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AA... github-actions@geysandr-bot" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Проверить SSH подключение с ключом
exit
ssh -i ~/.ssh/synology_github_actions admin@YOUR_NAS_IP
```

### 3.3 Настроить GitHub Secrets

```bash
# В GitHub Repository → Settings → Secrets and variables → Actions
# Добавить:

SYNOLOGY_HOST=192.168.1.100    # IP вашего NAS
SYNOLOGY_USER=admin            # SSH пользователь
SYNOLOGY_SSH_KEY=              # Содержимое ~/.ssh/synology_github_actions (приватный ключ)
```

## Шаг 4: Первоначальный деплой

### 4.1 Создать конфигурационные файлы на NAS

```bash
# SSH в NAS
ssh admin@YOUR_NAS_IP
cd /volume1/docker/geysandr-bot

# Создать .env.docker
cat > .env.docker << 'EOF'
# Telegram настройки
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_CHAT_ID=your_chat_id_here

# OpenAI настройки  
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-5-nano
AI_MODE=hybrid
AI_PROBABILITY=0.8

# Производственные настройки
DATABASE_PATH=/app/data/memory.db
MEMORY_DAYS=30
SUMMARY_AFTER_MESSAGES=50
SHORT_TERM_LIMIT=25
CONTEXT_RELEVANCE_THRESHOLD=0.7
DEV_MODE=false
NODE_ENV=production
PERSONALITY_FILE=/app/chat/result_personality.json
EOF

# Установить права доступа
chmod 600 .env.docker
```

### 4.2 Создать docker-compose.yml на NAS

```bash
# Скачать docker-compose.yml из репозитория
wget https://raw.githubusercontent.com/USERNAME/REPO/main/docker-compose.yml

# Или создать базовую версию:
cat > docker-compose.yml << 'EOF'
# Docker Compose для Гейсандра Куловича

services:
  geysandr-bot:
    image: ghcr.io/USERNAME/REPO:latest
    container_name: geysandr-kylovich-bot
    restart: unless-stopped
    
    env_file:
      - .env.docker
    
    volumes:
      - bot-data:/app/data
      - bot-logs:/app/logs
      - ./chat/result_personality.json:/app/chat/result_personality.json:ro
    
    healthcheck:
      test: ["CMD", "bun", "run", "health-check", "--quick"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s
    
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
    
    networks:
      - bot-network

volumes:
  bot-data:
    driver: local
    name: geysandr_bot_data
  bot-logs:
    driver: local
    name: geysandr_bot_logs

networks:
  bot-network:
    driver: bridge
    name: geysandr_network
EOF
```

### 4.3 Загрузить личность бота

```bash
# Если у вас есть файл личности, скопировать на NAS:
# На локальном компьютере:
scp chat/result_personality.json admin@YOUR_NAS_IP:/volume1/docker/geysandr-bot/chat/

# Или создать заглушку на NAS:
mkdir -p chat
echo '{"patterns":[],"responseStyle":{},"schedule":{}}' > chat/result_personality.json
```

## Шаг 5: Тестовый запуск

### 5.1 Первый запуск

```bash
# На NAS
cd /volume1/docker/geysandr-bot

# Создать и запустить контейнер
docker compose up -d

# Проверить статус
docker compose ps

# Проверить логи
docker compose logs -f geysandr-bot
```

### 5.2 Проверить работу бота

```bash
# Health check
docker compose exec geysandr-bot bun run health-check

# Проверить Telegram подключение
# Отправить сообщение боту в Telegram чат
# Проверить что бот отвечает

# Проверить логи ответов
docker compose logs --tail=20 geysandr-bot
```

## Шаг 6: Автозапуск и мониторинг

### 6.1 Настроить автозапуск

```bash
# Control Panel → Task Scheduler
# Create → Triggered Task → User-defined script

# Имя: Geysandr Bot Startup
# Триггер: Boot-up
# Script:
cd /volume1/docker/geysandr-bot
docker compose up -d
```

### 6.2 Настроить мониторинг в Container Manager

```bash
# Container Manager → Container → geysandr-kylovich-bot
# Настроить уведомления и лимиты ресурсов
```

### 6.3 Настроить логирование

```bash
# DSM → Log Center
# Добавить Docker в источники логов
# Настроить уведомления при критических ошибках
```

## Шаг 7: Настройка брандмауэра и безопасности

### 7.1 Firewall правила

```bash
# Control Panel → Security → Firewall
# Разрешить только нужные порты:
# - SSH (22) - только с доверенных IP
# - HTTPS (443) - для Container Manager
```

### 7.2 Auto Block настройка

```bash
# Control Panel → Security → Auto Block
# ✅ Enable auto block
# ✅ Block IP after 10 login failures
# ✅ Block for 60 minutes
```

### 7.3 Backup настройка

```bash
# Control Panel → Update & Restore → Configuration Backup
# Создать расписание backup конфигурации DSM
```

## Шаг 8: Отладка и troubleshooting

### 8.1 Проверка подключений

```bash
# SSH тест с локального компьютера
ssh -i ~/.ssh/synology_github_actions admin@YOUR_NAS_IP "echo 'SSH OK'"

# Docker тест
ssh -i ~/.ssh/synology_github_actions admin@YOUR_NAS_IP "docker ps"

# Network тест
ssh -i ~/.ssh/synology_github_actions admin@YOUR_NAS_IP "ping -c 3 8.8.8.8"
```

### 8.2 Проверка ресурсов

```bash
# Resource Monitor в DSM или CLI:
ssh admin@YOUR_NAS_IP

# CPU и Memory
htop

# Disk space
df -h

# Docker stats
docker stats --no-stream
```

### 8.3 Логи для диагностики

```bash
# System логи
cat /var/log/messages | grep docker

# Docker логи
docker compose logs --tail=50 geysandr-bot

# Container Manager логи
# DSM → Log Center → Container
```

## Чек-лист настройки

### ✅ Базовые настройки
- [ ] DSM 7.0+ установлен
- [ ] SSH доступ включен  
- [ ] Docker установлен
- [ ] Папка структура создана
- [ ] Пользователь настроен

### ✅ SSH и безопасность
- [ ] SSH ключи сгенерированы
- [ ] Публичный ключ добавлен на NAS
- [ ] SSH подключение работает
- [ ] GitHub Secrets настроены
- [ ] Firewall правила установлены

### ✅ Docker и бот
- [ ] .env.docker создан с токенами
- [ ] docker-compose.yml загружен
- [ ] Файл личности скопирован
- [ ] Контейнер запускается
- [ ] Health check проходит
- [ ] Telegram бот отвечает

### ✅ Автоматизация
- [ ] Автозапуск настроен
- [ ] CI/CD pipeline работает
- [ ] Мониторинг включен
- [ ] Backup настроен
- [ ] Уведомления работают

## Полезные команды для поддержки

```bash
# Быстрый статус бота
docker compose exec geysandr-bot bun run health-check --json

# Перезапуск
docker compose restart geysandr-bot

# Обновление
docker compose pull && docker compose up -d --force-recreate

# Бэкап данных
tar -czf backup_$(date +%Y%m%d).tar.gz data/ chat/ .env.docker

# Просмотр использования ресурсов
docker stats geysandr-kylovich-bot --no-stream
```

---

🎯 **После выполнения всех шагов ваша Synology NAS готова для production развертывания Гейсандра Куловича с полной автоматизацией CI/CD!**