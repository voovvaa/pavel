#!/usr/bin/env bash
set -euo pipefail

# --- Цвета/логи ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; PURPLE='\033[0;35m'; NC='\033[0m'
log(){ echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $*${NC}"; }
warn(){ echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $*${NC}"; }
error(){ echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $*${NC}"; exit 1; }
info(){ echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $*${NC}"; }
success(){ echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*${NC}"; }

DOCKER_REPO="${DOCKER_REPO:-voovaa/geysandr-bot}"
TIMESTAMP=$(date +%Y%m%d-%H%M)

log "🐳 Публикация образа в Docker Hub: $DOCKER_REPO"

# Проверяем что залогинены в Docker Hub
if ! docker info | grep -q "Username:"; then
    warn "Не залогинены в Docker Hub. Запустите: docker login"
    exit 1
fi

log "🔨 Собираем образ локально..."
docker build -t "$DOCKER_REPO:latest" -t "$DOCKER_REPO:$TIMESTAMP" .

info "🏷️ Созданные теги:"
echo "  - $DOCKER_REPO:latest"
echo "  - $DOCKER_REPO:$TIMESTAMP"

log "📤 Отправляем образы в Docker Hub..."

info "Отправляем latest тег..."
docker push "$DOCKER_REPO:latest"

info "Отправляем временной тег $TIMESTAMP..."
docker push "$DOCKER_REPO:$TIMESTAMP"

success "🎉 Образы успешно опубликованы в Docker Hub!"
success "📋 Образы доступны:"
echo "  - $DOCKER_REPO:latest"
echo "  - $DOCKER_REPO:$TIMESTAMP"

log "🚀 Для деплоя на NAS выполните:"
echo "  docker-compose pull && docker-compose up -d"