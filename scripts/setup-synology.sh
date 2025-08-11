#!/bin/bash

# Скрипт автоматической настройки Synology NAS для Гейсандра Куловича
set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Функции логирования
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

success() {
    echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

# Проверка аргументов
if [ $# -ne 1 ]; then
    error "Использование: $0 <NAS_IP>"
    echo "Пример: $0 192.168.1.100"
    exit 1
fi

NAS_IP=$1
NAS_USER="admin"
SSH_KEY_PATH="$HOME/.ssh/synology_github_actions"
PROJECT_DIR="/volume1/docker/geysandr-bot"

log "🚀 Начинаем настройку Synology NAS для Гейсандра Куловича..."
info "NAS IP: $NAS_IP"
info "SSH User: $NAS_USER"

# Проверка доступности NAS
log "📡 Проверяем доступность NAS..."
if ! ping -c 3 $NAS_IP > /dev/null 2>&1; then
    error "NAS $NAS_IP недоступен. Проверьте IP адрес и подключение."
fi
success "NAS доступен"

# Генерация SSH ключей
log "🔐 Настраиваем SSH ключи..."
if [ ! -f "$SSH_KEY_PATH" ]; then
    info "Генерируем новый SSH ключ для GitHub Actions..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -C "github-actions@geysandr-bot" -N ""
    success "SSH ключ создан: $SSH_KEY_PATH"
else
    warn "SSH ключ уже существует: $SSH_KEY_PATH"
fi

# Копирование публичного ключа на NAS
log "📤 Копируем SSH ключ на NAS..."
if ssh-copy-id -i "$SSH_KEY_PATH.pub" "$NAS_USER@$NAS_IP" 2>/dev/null; then
    success "SSH ключ скопирован на NAS"
else
    warn "Не удалось автоматически скопировать ключ. Попробуем вручную..."
    
    # Создание .ssh директории и добавление ключа вручную
    ssh "$NAS_USER@$NAS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh" || error "Не удалось создать .ssh директорию"
    
    PUBLIC_KEY=$(cat "$SSH_KEY_PATH.pub")
    ssh "$NAS_USER@$NAS_IP" "echo '$PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    success "SSH ключ добавлен вручную"
fi

# Тест SSH подключения с ключом
log "🔑 Тестируем SSH подключение с ключом..."
if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" "echo 'SSH OK'" > /dev/null 2>&1; then
    success "SSH подключение с ключом работает"
else
    error "SSH подключение с ключом не работает"
fi

# Настройка структуры директорий на NAS
log "📁 Создаем структуру директорий на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "
    mkdir -p $PROJECT_DIR/{data,logs,chat,backups,scripts}
    chmod 755 $PROJECT_DIR
    chmod 755 $PROJECT_DIR/{data,logs,chat,backups,scripts}
"
success "Директории созданы"

# Проверка Docker на NAS
log "🐳 Проверяем Docker на NAS..."
DOCKER_VERSION=$(ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "docker --version 2>/dev/null" || echo "")
if [ -z "$DOCKER_VERSION" ]; then
    error "Docker не установлен на NAS. Установите Docker из Package Center."
else
    success "Docker найден: $DOCKER_VERSION"
fi

# Создание базового .env.docker файла
log "⚙️ Создаем базовый .env.docker файл..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/.env.docker << 'EOF'
# ВАЖНО: Замените на реальные значения перед запуском

# Telegram настройки
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
ALLOWED_CHAT_ID=YOUR_CHAT_ID

# OpenAI настройки
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5-nano
AI_MODE=hybrid
AI_PROBABILITY=0.8

# Настройки памяти для Docker
DATABASE_PATH=/app/data/memory.db
MEMORY_DAYS=30
SUMMARY_AFTER_MESSAGES=50
SHORT_TERM_LIMIT=25
CONTEXT_RELEVANCE_THRESHOLD=0.7

# Production настройки
DEV_MODE=false
NODE_ENV=production
PERSONALITY_FILE=/app/chat/result_personality.json
EOF

chmod 600 $PROJECT_DIR/.env.docker"
success ".env.docker создан"

# Создание базового docker-compose.yml
log "🐳 Создаем docker-compose.yml..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/docker-compose.yml << 'EOF'
# Docker Compose для Гейсандра Куловича

services:
  geysandr-bot:
    image: ghcr.io/username/geysandr-bot:latest  # Замените username на ваш GitHub username
    container_name: geysandr-kylovich-bot
    restart: unless-stopped
    
    env_file:
      - .env.docker
    
    volumes:
      - bot-data:/app/data
      - bot-logs:/app/logs
      - ./chat/result_personality.json:/app/chat/result_personality.json:ro
    
    healthcheck:
      test: [\"CMD\", \"bun\", \"run\", \"health-check\", \"--quick\"]
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
        max-size: \"50m\"
        max-file: \"3\"
    
    networks:
      - bot-network
    
    labels:
      - \"app=geysandr-bot\"
      - \"version=latest\"

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
EOF"
success "docker-compose.yml создан"

# Создание заглушки для файла личности
log "🎭 Создаем заглушку для файла личности..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/chat/result_personality.json << 'EOF'
{
  \"patterns\": [
    {
      \"id\": \"greeting\",
      \"keywords\": [\"привет\", \"hello\", \"hi\"],
      \"responses\": [\"Привет!\", \"Здарова!\", \"Как дела?\"],
      \"weight\": 10,
      \"context\": \"Приветствие\"
    }
  ],
  \"responseStyle\": {
    \"averageLength\": 25,
    \"commonWords\": [\"привет\", \"как\", \"дела\"],
    \"commonEmojis\": [\"😊\", \"👋\"],
    \"formalityLevel\": 0.3,
    \"activityLevel\": 1
  },
  \"schedule\": {
    \"activeHours\": [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    \"activeDays\": [0, 1, 2, 3, 4, 5, 6]
  }
}
EOF"
success "Базовая личность создана"

# Копирование скриптов деплоя
log "📜 Копируем скрипты деплоя..."
if [ -d "scripts" ]; then
    scp -i "$SSH_KEY_PATH" -r scripts/* "$NAS_USER@$NAS_IP:$PROJECT_DIR/scripts/"
    ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "chmod +x $PROJECT_DIR/scripts/*.sh"
    success "Скрипты скопированы"
else
    warn "Директория scripts не найдена локально. Создаем базовые скрипты..."
    
    # Создание базового скрипта деплоя на NAS
    ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/deploy.sh << 'EOF'
#!/bin/bash
set -e

cd /volume1/docker/geysandr-bot

echo \"🚀 Деплой Гейсандра Куловича...\"

# Создаем бэкап
echo \"📦 Создаем бэкап...\"
tar -czf \"backups/backup_\$(date +%Y%m%d_%H%M%S).tar.gz\" data/ chat/ .env.docker 2>/dev/null || true

# Останавливаем контейнер
echo \"⏹️  Останавливаем старый контейнер...\"
docker compose down || true

# Пуллим новый образ
echo \"📥 Загружаем новый образ...\"
docker compose pull

# Запускаем контейнер
echo \"▶️  Запускаем контейнер...\"
docker compose up -d

echo \"✅ Деплой завершен!\"
EOF

chmod +x $PROJECT_DIR/scripts/deploy.sh"
    success "Базовый скрипт деплоя создан"
fi

# Создание скрипта автозапуска
log "🔄 Создаем скрипт автозапуска..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/autostart.sh << 'EOF'
#!/bin/bash

# Скрипт автозапуска для Task Scheduler
sleep 30  # Ждем загрузку системы

cd /volume1/docker/geysandr-bot
docker compose up -d

echo \"\$(date): Geysandr Bot autostart completed\" >> /var/log/geysandr-autostart.log
EOF

chmod +x $PROJECT_DIR/scripts/autostart.sh"
success "Скрипт автозапуска создан"

# Тестирование базовой настройки
log "🧪 Тестируем базовую настройку..."

# Проверка структуры файлов
info "Проверяем структуру файлов..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "ls -la $PROJECT_DIR"

# Проверка конфигурации Docker Compose
info "Проверяем конфигурацию Docker Compose..."
if ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cd $PROJECT_DIR && docker compose config" > /dev/null 2>&1; then
    success "Docker Compose конфигурация валидна"
else
    warn "Docker Compose конфигурация может содержать ошибки"
fi

# Отображение информации для GitHub Secrets
log "📋 Информация для настройки GitHub Secrets:"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "SYNOLOGY_HOST = $NAS_IP"
info "SYNOLOGY_USER = $NAS_USER"
echo
info "SYNOLOGY_SSH_KEY = (скопируйте содержимое ниже):"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cat "$SSH_KEY_PATH"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Следующие шаги
log "📋 Следующие шаги:"
echo
info "1. Настройте GitHub Secrets (см. выше)"
info "2. Отредактируйте $PROJECT_DIR/.env.docker с реальными токенами"
info "3. Обновите docker-compose.yml с правильным GitHub username"
info "4. Настройте Task Scheduler для автозапуска:"
info "   - Control Panel → Task Scheduler → Create → Triggered Task"
info "   - Event: Boot-up"
info "   - Script: $PROJECT_DIR/scripts/autostart.sh"
info "5. Первый деплой через GitHub Actions или вручную:"
info "   ssh -i $SSH_KEY_PATH $NAS_USER@$NAS_IP"
info "   cd $PROJECT_DIR && ./scripts/deploy.sh"

success "🎉 Настройка Synology NAS завершена!"
success "Гейсандр Кулович готов к деплою!"

# Создание summary файла
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/SETUP_SUMMARY.md << EOF
# Synology NAS Setup Summary

## Настройка завершена: $(date)

### Созданные директории:
- $PROJECT_DIR/data - данные бота
- $PROJECT_DIR/logs - логи
- $PROJECT_DIR/chat - файлы личности
- $PROJECT_DIR/backups - бэкапы
- $PROJECT_DIR/scripts - скрипты деплоя

### Созданные файлы:
- .env.docker - переменные окружения (требует редактирования)
- docker-compose.yml - конфигурация контейнера (требует обновления username)
- chat/result_personality.json - базовая личность
- scripts/deploy.sh - скрипт деплоя
- scripts/autostart.sh - скрипт автозапуска

### SSH ключ создан:
- Приватный ключ: $SSH_KEY_PATH (для GitHub Secrets)
- Публичный ключ установлен на NAS

### Следующие действия:
1. Настроить GitHub Secrets
2. Обновить .env.docker с реальными токенами
3. Обновить docker-compose.yml с GitHub username
4. Настроить Task Scheduler
5. Запустить первый деплой

### Полезные команды:
\`\`\`bash
# Подключение к NAS
ssh -i $SSH_KEY_PATH $NAS_USER@$NAS_IP

# Переход в директорию проекта
cd $PROJECT_DIR

# Деплой
./scripts/deploy.sh

# Статус
docker compose ps

# Логи
docker compose logs -f geysandr-bot
\`\`\`
EOF"

info "📄 Summary сохранен в $PROJECT_DIR/SETUP_SUMMARY.md"