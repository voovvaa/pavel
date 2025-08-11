#!/bin/bash

# Локальный деплой на Synology NAS (с вашей машины)
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"; }

# Конфигурация
NAS_IP="192.168.1.70"
NAS_USER="volodya"
SSH_KEY="$HOME/.ssh/synology_github_actions_rsa"
PROJECT_DIR="/volume1/docker/geysandr-bot"

log "🚀 Локальный деплой Гейсандра Куловича на NAS"

# Проверяем подключение
if ! ping -c 1 $NAS_IP > /dev/null 2>&1; then
    warn "NAS недоступен по адресу $NAS_IP"
    exit 1
fi

if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$NAS_USER@$NAS_IP" "echo 'SSH OK'" > /dev/null 2>&1; then
    warn "SSH подключение не работает"
    exit 1
fi

info "✅ Подключение к NAS работает"

# Создаем директории на NAS
log "📁 Создаем структуру папок на NAS..."
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
    mkdir -p $PROJECT_DIR
    mkdir -p $PROJECT_DIR/chat
    mkdir -p $PROJECT_DIR/scripts
    mkdir -p $PROJECT_DIR/data
    mkdir -p $PROJECT_DIR/logs
"

# Копируем файлы проекта
log "📤 Копируем файлы проекта..."
scp -i "$SSH_KEY" -r \
    Dockerfile \
    docker-compose.yml \
    package.json \
    bun.lockb \
    tsconfig.json \
    src/ \
    "$NAS_USER@$NAS_IP:$PROJECT_DIR/"

# Копируем скрипты
log "📜 Копируем скрипты..."
scp -i "$SSH_KEY" -r scripts/ "$NAS_USER@$NAS_IP:$PROJECT_DIR/"

# Копируем конфигурацию
log "⚙️ Копируем конфигурацию..."
if [ -f ".env.docker.example" ]; then
    scp -i "$SSH_KEY" .env.docker.example "$NAS_USER@$NAS_IP:$PROJECT_DIR/"
fi

# Копируем личность бота
if [ -f "chat/result_personality.json" ]; then
    log "🎭 Копируем личность бота..."
    scp -i "$SSH_KEY" chat/result_personality.json "$NAS_USER@$NAS_IP:$PROJECT_DIR/chat/"
fi

# Создаем .env.docker на NAS
log "📝 Создаем .env.docker..."
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
cd $PROJECT_DIR

# Создаем .env.docker файл
cat > .env.docker << 'EOF'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-your_bot_token_here}
ALLOWED_CHAT_ID=${ALLOWED_CHAT_ID:-your_chat_id_here}

# OpenAI Configuration  
OPENAI_API_KEY=${OPENAI_API_KEY:-your_openai_key_here}
OPENAI_MODEL=gpt-5-nano
AI_MODE=hybrid
AI_PROBABILITY=0.8

# Memory Configuration
DATABASE_PATH=/app/data/memory.db
MEMORY_DAYS=30
SUMMARY_AFTER_MESSAGES=50
SHORT_TERM_LIMIT=25
CONTEXT_RELEVANCE_THRESHOLD=0.7

# Bot Configuration
DEV_MODE=false
NODE_ENV=production
PERSONALITY_FILE=/app/chat/result_personality.json

# Logging
LOG_LEVEL=info
EOF

echo '📝 .env.docker создан. ВАЖНО: Обновите токены и API ключи!'
"

# Выполняем деплой на NAS
log "🐳 Запускаем деплой на NAS..."
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
cd $PROJECT_DIR
chmod +x scripts/*.sh

# Запускаем деплой скрипт
./scripts/deploy.sh
"

info "🎉 Локальный деплой завершен!"
info "🔗 Для обновления токенов: ssh -i $SSH_KEY $NAS_USER@$NAS_IP"
info "📊 Логи бота: ssh -i $SSH_KEY $NAS_USER@$NAS_IP 'cd $PROJECT_DIR && docker compose logs -f geysandr-bot'"