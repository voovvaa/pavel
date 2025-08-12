#!/usr/bin/env bash
set -euo pipefail

NAS_IP="${NAS_IP:-}"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"

log(){ printf '\033[0;32m[%(%F %T)T] %s\033[0m\n' -1 "$*"; }
warn(){ printf '\033[1;33m[%(%F %T)T] ⚠️  %s\033[0m\n' -1 "$*"; }
error(){ printf '\033[0;31m[%(%F %T)T] ❌ %s\033[0m\n' -1 "$*"; exit 1; }

ssh_cmd() {
  local host="$NAS_USER@$NAS_IP"
  if [[ -f "$SSH_KEY_PATH" ]]; then
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$host" "$@"
  else
    ssh -o StrictHostKeyChecking=no "$host" "$@"
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

[[ -n "$NAS_IP" ]] || error "Укажи NAS_IP: пример NAS_IP=192.168.1.10 ./update.sh"

COMPOSE_CMD="$(detect_compose_remote)"
[[ -n "$COMPOSE_CMD" ]] || error "docker compose не найден на NAS"

log "🏗️  Пересборка (на NAS)"
ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD build --pull"

log "🔁 Обновление без даунтайма (перезапуск)"
ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD up -d"

log "🩺 Health-check"
if ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD run --rm geysandr-bot bun run health-check --quick" >/dev/null 2>&1; then
  log '✅ OK'
else
  warn "Показываю логи:"
  ssh_cmd "cd $PROJECT_DIR && $COMPOSE_CMD logs --tail=200 geysandr-bot || true"
  exit 1
fi
