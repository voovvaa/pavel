#!/usr/bin/env bash
set -euo pipefail

NAS_IP="${NAS_IP:-}"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"
KEEP="${KEEP:-10}"

log(){ printf '\033[0;32m[%(%F %T)T] %s\033[0m\n' -1 "$*"; }
error(){ printf '\033[0;31m[%(%F %T)T] ❌ %s\033[0m\n' -1 "$*"; exit 1; }

ssh_cmd() {
  local host="$NAS_USER@$NAS_IP"
  if [[ -f "$SSH_KEY_PATH" ]]; then
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$host" "$@"
  else
    ssh -o StrictHostKeyChecking=no "$host" "$@"
  fi
}

[[ -n "$NAS_IP" ]] || error "Укажи NAS_IP: пример NAS_IP=192.168.1.10 ./backup.sh"

TS="$(date +%Y%m%d_%H%M%S)"
log "📦 Бэкап на NAS ($PROJECT_DIR/backups) — $TS"
ssh_cmd "cd $PROJECT_DIR && tar -czf backups/backup_${TS}.tar.gz data/ chat/ .env.docker docker-compose.yml 2>/dev/null || true"
log "🧹 Чищу старые бэкапы, оставляю $KEEP шт."
ssh_cmd "cd $PROJECT_DIR/backups && ls -1t backup_*.tar.gz | tail -n +$((KEEP+1)) | xargs -r rm -f"
log "✅ Готово"
