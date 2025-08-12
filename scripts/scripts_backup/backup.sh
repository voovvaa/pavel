#!/bin/bash

# Скрипт бэкапа данных бота
set -e

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

# Создаем директорию для бэкапов
BACKUP_DIR="backups/$(date +'%Y%m%d_%H%M%S')"
mkdir -p "$BACKUP_DIR"

log "📦 Создаем бэкап в $BACKUP_DIR"

# Бэкапим базу данных памяти
if [ -f "memory.db" ]; then
    log "💾 Бэкапим базу памяти..."
    cp memory.db "$BACKUP_DIR/"
else
    warn "memory.db не найдена"
fi

# Бэкапим файл личности
if [ -f "chat/result_personality.json" ]; then
    log "🎭 Бэкапим личность бота..."
    mkdir -p "$BACKUP_DIR/chat"
    cp chat/result_personality.json "$BACKUP_DIR/chat/"
else
    warn "result_personality.json не найдена"
fi

# Бэкапим конфигурацию
log "⚙️ Бэкапим конфигурацию..."
cp package.json "$BACKUP_DIR/" 2>/dev/null || true
cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true
cp Dockerfile "$BACKUP_DIR/" 2>/dev/null || true

# Если есть .env.docker - делаем бэкап без секретов
if [ -f ".env.docker" ]; then
    log "🔐 Бэкапим конфигурацию окружения (без секретов)..."
    grep -v "TOKEN\|KEY\|SECRET" .env.docker > "$BACKUP_DIR/.env.docker.backup" 2>/dev/null || true
fi

# Создаем архив
log "📁 Создаем архив..."
tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

log "✅ Бэкап создан: ${BACKUP_DIR}.tar.gz"

# Очищаем старые бэкапы (оставляем последние 10)
log "🧹 Очищаем старые бэкапы..."
ls -t backups/*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm --

log "🎉 Бэкап завершен!"