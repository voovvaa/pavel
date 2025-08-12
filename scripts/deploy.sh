#!/usr/bin/env bash
set -euo pipefail

# ---- Config ----
NAS_IP="${NAS_IP:-}"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"

# Files/dirs to sync (relative to repo root)
RSYNC_EXCLUDES=(
  ".git/"
  "node_modules/"
  "dist/"
  ".DS_Store"
  "*.log"
  "backups/"
)

# ---- Helpers ----
log()    { printf '\033[0;32m[%(%F %T)T] %s\033[0m\n' -1 "$*"; }
warn()   { printf '\033[1;33m[%(%F %T)T] ⚠️  %s\033[0m\n' -1 "$*"; }
error()  { printf '\033[0;31m[%(%F %T)T] ❌ %s\033[0m\n' -1 "$*"; exit 1; }

need()   { command -v "$1" >/dev/null 2>&1 || error "Требуется команда '$1'"; }

ssh_cmd() {
  local host="$NAS_USER@$NAS_IP"
  if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$host" "$@"
  else
    ssh -o StrictHostKeyChecking=no "$host" "$@"
  fi
}

scp_cmd() {
  local src="$1" dst="$2"
  local host="$NAS_USER@$NAS_IP"
  if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -r "$src" "$host:$dst"
  else
    scp -o StrictHostKeyChecking=no -r "$src" "$host:$dst"
  fi
}

rsync_push() {
  local host="$NAS_USER@$NAS_IP"
  local exclude_args=()
  for p in "${RSYNC_EXCLUDES[@]}"; do exclude_args+=(--exclude "$p"); done
  if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
    rsync -az --delete -e "ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no" "${exclude_args[@]}" ./ "$host:$PROJECT_DIR/"
  else
    rsync -az --delete -e "ssh -o StrictHostKeyChecking=no" "${exclude_args[@]}" ./ "$host:$PROJECT_DIR/"
  fi
}

detect_compose_remote() {
  ssh_cmd '\
DOCKER_BIN="";
for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do
  if [ -x "$d" ]; then DOCKER_BIN="$d"; break; fi
done
if [ -n "$DOCKER_BIN" ] && $DOCKER_BIN compose version >/dev/null 2>&1; then
  echo "$DOCKER_BIN compose"
elif command -v docker-compose >/dev/null 2>&1; then
  echo "docker-compose"
elif [ -x /usr/local/bin/docker-compose ]; then
  echo "/usr/local/bin/docker-compose"
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then
  echo "/var/packages/Docker/target/bin/docker-compose"
else
  echo ""
fi'
}

healthcheck_remote() {
  local COMPOSE_CMD="$1"
  # Try explicit health-check task if present
  if ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD run --rm geysandr-bot bun run health-check --quick" >/dev/null 2>&1; then
    return 0
  fi
  # Fallback: wait for healthy status via docker
  local name="geysandr-kylovich-bot"
  for i in {1..20}; do
    local st
    st=$(ssh_cmd "docker inspect -f '{{.State.Health.Status}}' $name" 2>/dev/null || true)
    if [[ "$st" == "healthy" ]]; then return 0; fi
    sleep 3
  done
  return 1
}

# ---- Checks ----
[[ -n "$NAS_IP" ]] || error "Укажи NAS_IP: пример запуск: NAS_IP=192.168.1.10 ./deploy.sh"
need ssh
need rsync

log "📡 Проверяем доступность NAS..."
ping -c 2 "$NAS_IP" >/dev/null 2>&1 || warn "Ping не проходит — продолжаю по SSH"

log "🐳 Проверяем Docker на NAS..."
DOCKER_V=$(ssh_cmd 'docker --version 2>/dev/null' || true)
[[ -n "$DOCKER_V" ]] || error "Docker не найден на NAS"

COMPOSE_CMD="$(detect_compose_remote)"
[[ -n "$COMPOSE_CMD" ]] || error "Не найден docker compose на NAS"
log "✅ Compose: $COMPOSE_CMD"

# ---- Sync project ----
log "📁 Готовлю директорию на NAS: $PROJECT_DIR"
ssh_cmd "mkdir -p $PROJECT_DIR"

log "🚚 Синхронизирую проект на NAS (rsync)..."
rsync_push

# ---- Build & Up ----
log "🏗️  Сборка образа (на NAS)"
ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD -f docker-compose.yml build --pull"

log "▶️  Запуск контейнера"
ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD -f docker-compose.yml up -d"

log "🩺 Жду health-check..."
if healthcheck_remote "$COMPOSE_CMD"; then
  log "✅ Контейнер в состоянии healthy"
else
  warn "Health-check не прошёл. Показываю последние логи:"
  ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD logs --tail=200 geysandr-bot || true"
  exit 1
fi

log "🎉 Деплой завершён"
