#!/bin/bash

# Скрипт обновления бота без остановки сервиса
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

log "🔄 Начинаем обновление Гейсандра Куловича..."

# Создаем бэкап перед обновлением
log "📦 Создаем бэкап перед обновлением..."
./scripts/backup.sh

# Проверяем есть ли новые изменения в коде
if command -v git &> /dev/null && [ -d ".git" ]; then
    log "📥 Получаем последние изменения..."
    git pull origin main
fi

# Переобучаем бота если есть новые данные чата
if [ -f "chat/result.json" ] && [ "chat/result.json" -nt "chat/result_personality.json" ]; then
    log "🧠 Переобучаем бота с новыми данными..."
    bun run analyze chat/result.json
    bun run patterns chat/result_analysis.json
    info "✅ Личность обновлена"
fi

# Проверяем здоровье текущего бота
log "🩺 Проверяем текущее состояние..."
$COMPOSE_CMD exec geysandr-bot bun run health-check --quick || warn "Текущий бот показал проблемы"

# Rolling update - собираем новый образ
log "🔨 Собираем новый образ..."
$COMPOSE_CMD build --no-cache

# Graceful restart
log "🔄 Выполняем graceful restart..."
$COMPOSE_CMD up -d --force-recreate

# Ждем запуска
log "⏳ Ждем запуска обновленного бота..."
sleep 20

# Проверяем что все работает
log "✅ Проверяем работу обновленного бота..."
if $COMPOSE_CMD ps | grep -q "Up"; then
    $COMPOSE_CMD exec geysandr-bot bun run health-check --quick
    log "🎉 Обновление завершено успешно!"
    
    info "📊 Статус контейнеров:"
    $COMPOSE_CMD ps
    
    info "📜 Последние логи:"
    $COMPOSE_CMD logs --tail=10 geysandr-bot
else
    warn "⚠️  Обновление завершилось с ошибками"
    $COMPOSE_CMD logs --tail=20 geysandr-bot
fi