#!/bin/bash

# Финальный импорт истории чата с учетом всех исправлений
set -e

GREEN='\033[0;32m'
PURPLE='\033[0;35m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"; }
success() { echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"; }
info() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"; }

# Конфигурация
NAS_IP="192.168.1.70"
NAS_USER="volodya"
SSH_KEY_PATH="$HOME/.ssh/synology_github_actions"
PROJECT_DIR="/volume1/docker/geysandr-bot"
LOCAL_CHAT_FILE="chat/result.json"

log "📦 Импорт истории чата на Synology NAS"

# Проверяем наличие файла
if [ ! -f "$LOCAL_CHAT_FILE" ]; then
    warn "Файл $LOCAL_CHAT_FILE не найден"
    exit 1
fi

FILE_SIZE=$(stat -f%z "$LOCAL_CHAT_FILE" 2>/dev/null || stat -c%s "$LOCAL_CHAT_FILE" 2>/dev/null)
info "Размер файла: $(($FILE_SIZE / 1024 / 1024)) MB"

# Копируем через SSH pipe (обходим проблемы SCP)
log "📤 Копируем файл чата на NAS..."
cat "$LOCAL_CHAT_FILE" | ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/chat/result.json"
success "Файл скопирован"

# Запускаем полный анализ на локальной машине (быстрее)
log "🧠 Анализируем чат локально..."
if command -v bun > /dev/null; then
    bun run analyze chat/result.json
    bun run patterns chat/result_analysis.json
    
    if [ -f "chat/result_personality.json" ]; then
        PATTERNS_COUNT=$(grep -o '"id"' chat/result_personality.json | wc -l)
        success "Извлечено $PATTERNS_COUNT паттернов личности"
        
        # Копируем результаты на NAS
        log "📊 Копируем результаты анализа на NAS..."
        cat chat/result_analysis.json | ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/chat/result_analysis.json"
        cat chat/result_personality.json | ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/chat/result_personality.json"
        success "Анализ скопирован на NAS"
    else
        warn "Анализ не создал файл личности"
    fi
else
    warn "Bun не установлен, анализ будет выполнен при следующем деплое"
fi

# Проверяем результат на NAS
log "📋 Проверяем результат на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "
cd $PROJECT_DIR
echo '📁 Файлы в директории chat/:'
ls -lah chat/

if [ -f 'chat/result_personality.json' ]; then
    echo '🎭 Статистика личности:'
    PATTERNS=\$(grep -o '\"id\"' chat/result_personality.json | wc -l)
    echo \"Паттернов: \$PATTERNS\"
    
    # Показываем несколько примеров
    echo '📝 Примеры паттернов:'
    head -20 chat/result_personality.json | grep -A 3 '\"id\"' | head -6 || echo 'Не удалось показать примеры'
fi
"

success "🎉 Импорт завершен успешно!"
info "💡 Для активации новой личности:"
info "- Перезапустите бот: ssh $NAS_USER@$NAS_IP 'cd $PROJECT_DIR && docker compose restart geysandr-bot'"
info "- Или выполните деплой через GitHub Actions"