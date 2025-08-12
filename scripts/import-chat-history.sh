#!/usr/bin/env bash
set -euo pipefail

NAS_IP="${NAS_IP:-}"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"
FILE="${1:-}"

log(){ printf '\033[0;32m[%(%F %T)T] %s\033[0m\n' -1 "$*"; }
error(){ printf '\033[0;31m[%(%F %T)T] ❌ %s\033[0m\n' -1 "$*"; exit 1; }

[[ -n "$NAS_IP" ]] || error "Укажи NAS_IP: NAS_IP=192.168.1.10 ./import-chat-history.sh path/to/result_personality.json"
[[ -n "$FILE" && -f "$FILE" ]] || error "Укажи существующий локальный файл личности"

ssh_cmd() {
  local host="$NAS_USER@$NAS_IP"
  if [[ -f "$SSH_KEY_PATH" ]]; then
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$host" "$@"
  else
    ssh -o StrictHostKeyChecking=no "$host" "$@"
  fi
}
scp_cmd() {
  local src="$1" dst="$2" host="$NAS_USER@$NAS_IP"
  if [[ -f "$SSH_KEY_PATH" ]]; then
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$src" "$host:$dst"
  else
    scp -o StrictHostKeyChecking=no "$src" "$host:$dst"
  fi
}

log "📤 Копирую личность → $PROJECT_DIR/chat/result_personality.json"
scp_cmd "$FILE" "$PROJECT_DIR/chat/result_personality.json"

COMPOSE_CMD=$(ssh_cmd 'if docker compose version >/dev/null 2>&1; then echo "docker compose";
elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose";
elif [ -x /usr/local/bin/docker-compose ]; then echo "/usr/local/bin/docker-compose";
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then echo "/var/packages/Docker/target/bin/docker-compose";
else echo ""; fi')
[[ -n "$COMPOSE_CMD" ]] || error "docker compose не найден на NAS"

log "🔄 Перезапуск контейнера для подхвата личности"
ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD up -d"

log "✅ Готово"
