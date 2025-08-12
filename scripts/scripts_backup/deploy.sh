#!/bin/bash

# Скрипт деплоя Гейсандра Куловича на Synology NAS
set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция логирования
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

# Проверяем наличие docker (Synology использует полные пути)
DOCKER_CMD="/usr/local/bin/docker"
COMPOSE_CMD="/usr/local/bin/docker-compose"

if [ ! -x "$DOCKER_CMD" ]; then
    if command -v docker &> /dev/null; then
        DOCKER_CMD="docker"
    else
        error "Docker не установлен"
    fi
fi

if [ ! -x "$COMPOSE_CMD" ]; then
    if $DOCKER_CMD compose version &> /dev/null; then
        COMPOSE_CMD="$DOCKER_CMD compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        error "Docker Compose не установлен"
    fi
fi

# Переменные
IMAGE_NAME="geysandr-bot"
IMAGE_TAG="latest"

log "🚀 Начинаем деплой Гейсандра Куловича..."

# Проверяем наличие .env.docker
if [ ! -f ".env.docker" ]; then
    warn ".env.docker не найден"
    if [ -f ".env.docker.example" ]; then
        log "Копируем .env.docker.example -> .env.docker"
        cp .env.docker.example .env.docker
        warn "❗ Отредактируйте .env.docker перед продолжением"
        read -p "Нажмите Enter когда готово..."
    else
        error ".env.docker.example не найден"
    fi
fi

# Проверяем наличие файла личности
if [ ! -f "chat/result_personality.json" ]; then
    warn "Файл личности не найден. Запускаем переобучение..."
    if [ -f "chat/result.json" ]; then
        bun run analyze chat/result.json
        bun run patterns chat/result_analysis.json
        log "✅ Личность обновлена"
    else
        error "chat/result.json не найден. Экспортируйте чат из Telegram"
    fi
fi

# Останавливаем старый контейнер
log "⏹️  Останавливаем старые контейнеры..."
$COMPOSE_CMD down --remove-orphans || warn "Контейнеры не были запущены"

# Собираем образ
log "🔨 Собираем Docker образ..."
$COMPOSE_CMD build --no-cache

# Запускаем health check
log "🩺 Проверяем здоровье системы..."
if ! bun run health-check --quick; then
    warn "Health check показал проблемы, но продолжаем деплой"
fi

# Запускаем контейнеры
log "▶️  Запускаем контейнеры..."
$COMPOSE_CMD up -d

# Ждем запуска
log "⏳ Ждем запуска бота (30 сек)..."
sleep 30

# Проверяем статус
log "📊 Проверяем статус контейнеров..."
$COMPOSE_CMD ps

# Проверяем логи
log "📜 Последние логи:"
$COMPOSE_CMD logs --tail=20 geysandr-bot

# Финальная проверка
if $COMPOSE_CMD ps | grep -q "Up"; then
    log "🎉 Деплой завершен успешно!"
    log "📱 Гейсандр Кулович готов к общению"
    
    echo ""
    echo -e "${BLUE}Полезные команды:${NC}"
    echo "  $COMPOSE_CMD logs -f geysandr-bot     # Смотреть логи в реальном времени"
    echo "  $COMPOSE_CMD exec geysandr-bot bun run health-check  # Проверка здоровья"
    echo "  $COMPOSE_CMD restart geysandr-bot     # Перезапуск бота"
    echo "  $COMPOSE_CMD down                     # Остановка всех контейнеров"
    
else
    error "Деплой не удался. Проверьте логи: $COMPOSE_CMD logs geysandr-bot"
fi