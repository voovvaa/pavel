#!/bin/bash

# Мониторинг обновлений чата и автоматический импорт
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

CHAT_FILE="chat/result.json"
WATCH_INTERVAL=60  # Проверяем каждую минуту
LAST_HASH_FILE=".chat_last_hash"

log "👁️ Мониторинг обновлений чата..."
info "Файл: $CHAT_FILE"
info "Интервал проверки: ${WATCH_INTERVAL}s"

# Функция получения хеша файла
get_file_hash() {
    if [ -f "$1" ]; then
        if command -v sha256sum > /dev/null; then
            sha256sum "$1" | cut -d' ' -f1
        elif command -v shasum > /dev/null; then
            shasum -a 256 "$1" | cut -d' ' -f1
        else
            stat -f%m "$1" 2>/dev/null || stat -c%Y "$1" 2>/dev/null
        fi
    else
        echo "no_file"
    fi
}

# Функция импорта чата
import_chat() {
    log "🔄 Обнаружено обновление чата, запускаем импорт..."
    
    if [ -f "scripts/import-chat-history.sh" ]; then
        ./scripts/import-chat-history.sh
    else
        warn "Скрипт импорта не найден, используем git commit для автоматического импорта"
        
        if command -v git > /dev/null && [ -d ".git" ]; then
            git add "$CHAT_FILE"
            git commit -m "data: обновлены данные чата [retrain]"
            git push origin main
            info "✅ Изменения отправлены в репозиторий для автоматического импорта"
        else
            warn "Git не настроен, импорт нужно выполнить вручную"
        fi
    fi
}

# Получаем начальный хеш
if [ -f "$CHAT_FILE" ]; then
    CURRENT_HASH=$(get_file_hash "$CHAT_FILE")
    echo "$CURRENT_HASH" > "$LAST_HASH_FILE"
    info "📊 Начальный хеш файла: ${CURRENT_HASH:0:16}..."
else
    warn "Файл чата не найден, ожидаем его появления..."
    echo "no_file" > "$LAST_HASH_FILE"
fi

# Основной цикл мониторинга
while true; do
    sleep "$WATCH_INTERVAL"
    
    CURRENT_HASH=$(get_file_hash "$CHAT_FILE")
    LAST_HASH=$(cat "$LAST_HASH_FILE" 2>/dev/null || echo "")
    
    if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
        if [ "$CURRENT_HASH" = "no_file" ]; then
            warn "Файл чата удален"
        elif [ "$LAST_HASH" = "no_file" ]; then
            info "🆕 Новый файл чата обнаружен!"
            import_chat
        else
            info "📝 Файл чата изменен!"
            import_chat
        fi
        
        echo "$CURRENT_HASH" > "$LAST_HASH_FILE"
    fi
    
    # Показываем статус каждые 10 минут
    if [ $(($(date +%s) % 600)) -lt $WATCH_INTERVAL ]; then
        info "👁️ Мониторинг активен, последняя проверка: $(date +'%H:%M:%S')"
        
        if [ -f "$CHAT_FILE" ]; then
            FILE_SIZE=$(stat -f%z "$CHAT_FILE" 2>/dev/null || stat -c%s "$CHAT_FILE" 2>/dev/null)
            FILE_DATE=$(stat -f%m "$CHAT_FILE" 2>/dev/null || stat -c%Y "$CHAT_FILE" 2>/dev/null)
            info "📊 Размер файла: $(($FILE_SIZE / 1024 / 1024)) MB, изменен: $(date -r $FILE_DATE +'%H:%M:%S')"
        fi
    fi
done