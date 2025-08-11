#!/bin/bash

# Автоматический импорт истории чата на Synology NAS
set -e

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

success() {
    echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

# Конфигурация
NAS_IP="192.168.1.70"
NAS_USER="volodya"
SSH_KEY_PATH="$HOME/.ssh/synology_github_actions"
PROJECT_DIR="/volume1/docker/geysandr-bot"
LOCAL_CHAT_FILE="chat/result.json"

log "📦 Автоматический импорт истории чата..."

# Проверяем наличие локального файла чата
if [ ! -f "$LOCAL_CHAT_FILE" ]; then
    warn "Файл $LOCAL_CHAT_FILE не найден локально"
    info "Пропускаем импорт истории - будет использована базовая личность"
    exit 0
fi

info "Найден файл чата: $LOCAL_CHAT_FILE"

# Получаем размер и дату файла
FILE_SIZE=$(stat -f%z "$LOCAL_CHAT_FILE" 2>/dev/null || stat -c%s "$LOCAL_CHAT_FILE" 2>/dev/null)
FILE_DATE=$(stat -f%m "$LOCAL_CHAT_FILE" 2>/dev/null || stat -c%Y "$LOCAL_CHAT_FILE" 2>/dev/null)

info "Размер файла: $(($FILE_SIZE / 1024 / 1024)) MB"
info "Дата изменения: $(date -r $FILE_DATE)"

# Копируем файл чата на NAS
log "📤 Копируем историю чата на NAS..."
scp -i "$SSH_KEY_PATH" "$LOCAL_CHAT_FILE" "$NAS_USER@$NAS_IP:$PROJECT_DIR/chat/"

success "История чата скопирована на NAS"

# Запускаем анализ и извлечение паттернов на NAS
log "🧠 Запускаем анализ чата на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" << NASEOF
set -e

cd $PROJECT_DIR

echo "📊 Анализируем историю чата..."
# Если бот запущен, выполняем анализ через контейнер
if docker compose ps | grep -q "Up"; then
    echo "🐳 Бот запущен, анализируем через контейнер..."
    docker compose exec -T geysandr-bot bun run analyze /app/chat/result.json || echo "Анализ через контейнер не удался"
    docker compose exec -T geysandr-bot bun run patterns /app/chat/result_analysis.json || echo "Извлечение паттернов через контейнер не удалось"
else
    echo "📋 Бот не запущен, создаем план для анализа при следующем деплое"
    # Создаем флаг для анализа при следующем запуске
    touch chat/need_reanalysis.flag
    echo "$(date): Chat updated, need reanalysis" > chat/need_reanalysis.flag
fi

# Проверяем результат
if [ -f "chat/result_personality.json" ]; then
    echo "✅ Личность обновлена"
    PATTERNS_COUNT=\$(grep -o '"id"' chat/result_personality.json | wc -l)
    echo "📊 Извлечено паттернов: \$PATTERNS_COUNT"
    
    # Показываем базовую статистику
    echo "📈 Статистика личности:"
    if command -v jq > /dev/null; then
        jq -r '.responseStyle | "Средняя длина ответа: " + (.averageLength | tostring) + " символов"' chat/result_personality.json || true
        jq -r '.responseStyle | "Уровень формальности: " + (.formalityLevel | tostring)' chat/result_personality.json || true
        jq -r '.schedule.activeHours | "Активные часы: " + (length | tostring) + " часов в день"' chat/result_personality.json || true
    fi
else
    echo "⚠️ Файл личности не создан, будет использована базовая версия"
fi

echo "🎯 Импорт истории чата завершен"
NASEOF

success "🎉 Импорт и анализ завершены!"

# Если есть результат, показываем краткую статистику
log "📊 Проверяем результат импорта..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "ls -la $PROJECT_DIR/chat/"

success "📦 Автоматический импорт истории чата завершен успешно!"

info "💡 Рекомендации:"
info "- При следующем деплое бот автоматически использует новую личность"
info "- Для принудительного переобучения: commit с [retrain] в сообщении"
info "- Мониторинг через: docker compose logs -f geysandr-bot"