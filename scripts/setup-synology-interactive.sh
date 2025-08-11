#!/bin/bash

# Интерактивная настройка Synology NAS для Гейсандра Куловича
set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

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

if [ $# -ne 1 ]; then
    error "Использование: $0 <NAS_IP>"
    exit 1
fi

NAS_IP=$1
NAS_USER="admin"
SSH_KEY_PATH="$HOME/.ssh/synology_github_actions"
PROJECT_DIR="/volume1/docker/geysandr-bot"

log "🚀 Интерактивная настройка Synology NAS для Гейсандра Куловича..."
info "NAS IP: $NAS_IP"
info "SSH User: $NAS_USER"

# Проверка доступности NAS
log "📡 Проверяем доступность NAS..."
if ! ping -c 2 $NAS_IP > /dev/null 2>&1; then
    error "NAS $NAS_IP недоступен"
fi
success "NAS доступен"

# Генерация SSH ключей
if [ ! -f "$SSH_KEY_PATH" ]; then
    log "🔐 Генерируем SSH ключ для GitHub Actions..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -C "github-actions@geysandr-bot" -N ""
    success "SSH ключ создан"
else
    success "SSH ключ уже существует"
fi

# Интерактивное копирование SSH ключа
log "📤 Копируем SSH ключ на NAS..."
info "Вам потребуется ввести пароль администратора NAS"

if ssh-copy-id -i "$SSH_KEY_PATH.pub" "$NAS_USER@$NAS_IP"; then
    success "SSH ключ скопирован"
else
    error "Не удалось скопировать SSH ключ"
fi

# Тест SSH подключения с ключом
log "🔑 Тестируем SSH подключение с ключом..."
if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" "echo 'SSH OK'" > /dev/null; then
    success "SSH подключение с ключом работает"
else
    error "SSH подключение с ключом не работает"
fi

log "📁 Создаем структуру директорий и файлов на NAS..."

# Выполняем настройку на NAS одной SSH сессией
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" << 'NASEOF'
set -e

PROJECT_DIR="/volume1/docker/geysandr-bot"

echo "📁 Создаем директории..."
mkdir -p $PROJECT_DIR/{data,logs,chat,backups,scripts}
chmod 755 $PROJECT_DIR
chmod 755 $PROJECT_DIR/{data,logs,chat,backups,scripts}

echo "🐳 Проверяем Docker..."
if ! docker --version > /dev/null 2>&1; then
    echo "❌ Docker не установлен. Установите Docker из Package Center."
    exit 1
fi
echo "✅ Docker найден: $(docker --version)"

echo "⚙️ Создаем .env.docker..."
cat > $PROJECT_DIR/.env.docker << 'EOF'
# ВАЖНО: Замените на реальные значения перед запуском

# Telegram настройки
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
ALLOWED_CHAT_ID=YOUR_CHAT_ID

# OpenAI настройки
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5-nano
AI_MODE=hybrid
AI_PROBABILITY=0.8

# Настройки памяти
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

chmod 600 $PROJECT_DIR/.env.docker

echo "🐳 Создаем docker-compose.yml..."
cat > $PROJECT_DIR/docker-compose.yml << 'EOF'
services:
  geysandr-bot:
    image: ghcr.io/username/geysandr-bot:latest
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
    
    labels:
      - "app=geysandr-bot"
      - "version=latest"

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

echo "🎭 Создаем базовую личность..."
cat > $PROJECT_DIR/chat/result_personality.json << 'EOF'
{
  "patterns": [
    {
      "id": "greeting",
      "keywords": ["привет", "hello", "hi"],
      "responses": ["Привет!", "Здарова!", "Как дела?"],
      "weight": 10,
      "context": "Приветствие"
    }
  ],
  "responseStyle": {
    "averageLength": 25,
    "commonWords": ["привет", "как", "дела"],
    "commonEmojis": ["😊", "👋"],
    "formalityLevel": 0.3,
    "activityLevel": 1
  },
  "schedule": {
    "activeHours": [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    "activeDays": [0, 1, 2, 3, 4, 5, 6]
  }
}
EOF

echo "📜 Создаем скрипт деплоя..."
cat > $PROJECT_DIR/scripts/deploy.sh << 'EOF'
#!/bin/bash
set -e

cd /volume1/docker/geysandr-bot

echo "🚀 Деплой Гейсандра Куловича..."

# Создаем бэкап
echo "📦 Создаем бэкап..."
tar -czf "backups/backup_$(date +%Y%m%d_%H%M%S).tar.gz" data/ chat/ .env.docker 2>/dev/null || true

# Останавливаем контейнер
echo "⏹️ Останавливаем старый контейнер..."
docker compose down || true

# Пуллим новый образ
echo "📥 Загружаем новый образ..."
docker compose pull

# Запускаем контейнер
echo "▶️ Запускаем контейнер..."
docker compose up -d

echo "✅ Деплой завершен!"
EOF

chmod +x $PROJECT_DIR/scripts/deploy.sh

echo "🔄 Создаем скрипт автозапуска..."
cat > $PROJECT_DIR/scripts/autostart.sh << 'EOF'
#!/bin/bash
sleep 30
cd /volume1/docker/geysandr-bot
docker compose up -d
echo "$(date): Geysandr Bot autostart completed" >> /var/log/geysandr-autostart.log
EOF

chmod +x $PROJECT_DIR/scripts/autostart.sh

echo "✅ Все файлы созданы на NAS"
ls -la $PROJECT_DIR
NASEOF

success "🎉 Настройка NAS завершена!"

# Показать информацию для GitHub Secrets
log "📋 Информация для GitHub Secrets:"
echo
info "В GitHub Repository → Settings → Secrets and variables → Actions добавить:"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "SYNOLOGY_HOST = $NAS_IP"
info "SYNOLOGY_USER = $NAS_USER"
echo
info "SYNOLOGY_SSH_KEY = (скопируйте приватный ключ ниже полностью):"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cat "$SSH_KEY_PATH"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
info "Также добавьте токены:"
info "TELEGRAM_BOT_TOKEN = ваш_telegram_bot_token"
info "OPENAI_API_KEY = ваш_openai_api_key"
info "ALLOWED_CHAT_ID = ваш_chat_id"

log "📋 Следующие шаги:"
info "1. Настройте GitHub Secrets (см. выше)"
info "2. Отредактируйте .env.docker на NAS с реальными токенами:"
info "   ssh -i $SSH_KEY_PATH $NAS_USER@$NAS_IP"
info "   nano $PROJECT_DIR/.env.docker"
info "3. Обновите docker-compose.yml с вашим GitHub username"
info "4. Настройте Task Scheduler для автозапуска"
info "5. Первый деплой через GitHub Actions"

success "🏠 Synology NAS готов для Гейсандра Куловича!"