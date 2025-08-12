#!/usr/bin/env bash
set -euo pipefail

# --- Цвета/логи ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; PURPLE='\033[0;35m'; NC='\033[0m'
log(){ echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $*${NC}"; }
warn(){ echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $*${NC}"; }
error(){ echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $*${NC}"; exit 1; }
info(){ echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $*${NC}"; }
success(){ echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*${NC}"; }

# --- Аргументы ---
if [ $# -ne 1 ]; then
  error "Использование: $0 <NAS_IP>"
fi
NAS_IP="$1"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"

log "🚀 Импорт данных чата на NAS ($NAS_IP)"

# --- Проверка локальных файлов ---
log "📋 Проверяем локальные файлы..."
[ -f "./chat/result.json" ] || error "Файл chat/result.json не найден"
[ -f "./chat/result_analysis.json" ] || error "Файл chat/result_analysis.json не найден"
[ -f "./chat/result_personality.json" ] || error "Файл chat/result_personality.json не найден"
[ -f "./src/utils/import-history.js" ] || error "Файл src/utils/import-history.js не найден"

info "Размеры файлов:"
du -h ./chat/result*.json ./src/utils/import-history.js

# --- Остановка контейнера ---
log "⏹️ Останавливаем контейнер..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose stop" || warn "Контейнер уже остановлен"

# --- Копирование файлов чата ---
log "📤 Копируем файлы чата на NAS..."
info "Копирую result.json (24MB)..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cat > $PROJECT_DIR/chat/result.json" < ./chat/result.json
success "result.json скопирован"

info "Копирую result_analysis.json..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cat > $PROJECT_DIR/chat/result_analysis.json" < ./chat/result_analysis.json
success "result_analysis.json скопирован"

info "Копирую result_personality.json..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cat > $PROJECT_DIR/chat/result_personality.json" < ./chat/result_personality.json
success "result_personality.json скопирован"

# --- Копирование скриптов утилит ---
log "🛠️ Копируем утилиты на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "mkdir -p $PROJECT_DIR/src/utils"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cat > $PROJECT_DIR/src/utils/import-history.js" < ./src/utils/import-history.js
success "import-history.js скопирован"

# --- Проверка файлов на NAS ---
log "📊 Проверяем файлы на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "ls -la $PROJECT_DIR/chat/ && echo '--- Размеры ---' && du -h $PROJECT_DIR/chat/* $PROJECT_DIR/src/utils/import-history.js"

# --- Деплой обновлений ---
log "🔄 Деплоим обновления кода на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && git pull && /usr/local/bin/docker compose build --no-cache"
success "Код обновлен и пересобран"

# --- Запуск импорта истории ---
log "📚 Запускаем импорт истории чата..."
info "Удаляем старую базу данных..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "/usr/local/bin/docker volume rm geysandr_bot_data 2>/dev/null || true"

info "Импортируем историю в новую базу..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && NODE_ENV=production /usr/local/bin/docker compose run --rm geysandr-bot bun run import-history" || {
  warn "Импорт через package.json не удался, попробуем прямой запуск..."
  
  ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
    "cd $PROJECT_DIR && NODE_ENV=production /usr/local/bin/docker compose run --rm geysandr-bot bun dist/utils/import-history.js" || {
    warn "Импорт через контейнер не удался, используем fallback..."
    
    # Fallback: копируем базу локально
    if [ -f "./memory.db" ]; then
      info "Копируем готовую базу данных..."
      ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
        "cat > /tmp/memory.db" < ./memory.db
      ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
        "/usr/local/bin/docker compose run --rm -v /tmp/memory.db:/app/data/memory.db geysandr-bot echo 'База скопирована'"
      success "База данных скопирована как fallback"
    else
      error "Импорт не удался и локальная база не найдена"
    fi
  }
}

# --- Регенерация личности ---
log "🎭 Регенерируем личность из новых данных..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose run --rm geysandr-bot bun src/analysis/pattern-extractor-cli.ts chat/result_analysis.json" || {
  warn "Регенерация личности не удалась, используем скопированную"
}

# --- Запуск контейнера ---
log "🚀 Запускаем контейнер с обновленными данными..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose up -d"

# --- Проверка статуса ---
log "📊 Проверяем статус запуска..."
sleep 10
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose ps && echo '--- Логи ---' && /usr/local/bin/docker compose logs --tail=15 geysandr-bot"

success "🎉 Импорт данных завершен!"
info "Проверьте логи выше на наличие сообщения 'изучил свой характер'"
info "Для мониторинга: ssh -i $SSH_KEY_PATH $NAS_USER@$NAS_IP 'cd $PROJECT_DIR && docker compose logs -f geysandr-bot'"