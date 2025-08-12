#!/usr/bin/env bash
set -euo pipefail

default_user="volodya"
default_key="$HOME/.ssh/synology_github_actions"
default_dir="/volume1/docker/geysandr-bot"

read -rp "NAS IP: " NAS_IP
read -rp "NAS user [$default_user]: " NAS_USER
NAS_USER="${NAS_USER:-$default_user}"
read -rp "SSH key path [$default_key]: " SSH_KEY_PATH
SSH_KEY_PATH="${SSH_KEY_PATH:-$default_key}"
read -rp "Project dir on NAS [$default_dir]: " PROJECT_DIR
PROJECT_DIR="${PROJECT_DIR:-$default_dir}"

log() { printf '\033[0;32m[%(%F %T)T] %s\033[0m\n' -1 "$*"; }
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
scp_cmd() {
  local src="$1" dst="$2" host="$NAS_USER@$NAS_IP"
  if [[ -f "$SSH_KEY_PATH" ]]; then
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -r "$src" "$host:$dst"
  else
    scp -o StrictHostKeyChecking=no -r "$src" "$host:$dst"
  fi
}

log "📡 Пинг NAS..."
ping -c 2 "$NAS_IP" >/dev/null 2>&1 || warn "Ping не прошёл — продолжу по SSH"

log "🔐 Настройка ключа (если нужно)..."
if [[ -f "$SSH_KEY_PATH.pub" ]]; then
  if ssh-copy-id -i "$SSH_KEY_PATH.pub" "$NAS_USER@$NAS_IP" 2>/dev/null; then
    log "✅ Ключ установлен через ssh-copy-id"
  else
    warn "ssh-copy-id не удался, добавляю ключ вручную"
    PUB=$(cat "$SSH_KEY_PATH.pub")
    ssh_cmd "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$PUB' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  fi
else
  warn "Публичный ключ не найден по пути $SSH_KEY_PATH.pub — пропускаю"
fi

log "📁 Создаю структуру директорий на NAS: $PROJECT_DIR"
ssh_cmd "mkdir -p $PROJECT_DIR/{data,logs,chat,backups,scripts} && chmod 755 $PROJECT_DIR $PROJECT_DIR/{data,logs,chat,backups,scripts}"

log "🐳 Проверяю Docker/Compose на NAS"
DOCKER_V=$(ssh_cmd 'docker --version 2>/dev/null' || true)
[[ -n "$DOCKER_V" ]] || error "Docker не найден на NAS — установи из Package Center"

COMPOSE_CMD=$(ssh_cmd 'if docker compose version >/dev/null 2>&1; then echo "docker compose";
elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose";
elif [ -x /usr/local/bin/docker-compose ]; then echo "/usr/local/bin/docker-compose";
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then echo "/var/packages/Docker/target/bin/docker-compose";
else echo ""; fi')
[[ -n "$COMPOSE_CMD" ]] || error "docker compose не найден на NAS"

log "⚙️  Загружаю .env.docker (если нет — создаю шаблон)"
if ! ssh_cmd "[ -f $PROJECT_DIR/.env.docker ]"; then
  scp_cmd /dev/stdin "$PROJECT_DIR/.env.docker" <<'EOF' >/dev/null 2>&1 || true
# Telegram
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
ALLOWED_CHAT_ID=YOUR_CHAT_ID

# OpenAI
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5-nano
AI_MODE=hybrid
AI_PROBABILITY=0.8

# Memory
DATABASE_PATH=/app/data/memory.db
MEMORY_DAYS=30
SUMMARY_AFTER_MESSAGES=50
SHORT_TERM_LIMIT=25
CONTEXT_RELEVANCE_THRESHOLD=0.7

# Production
DEV_MODE=false
NODE_ENV=production
PERSONALITY_FILE=/app/chat/result_personality.json
EOF
  ssh_cmd "chmod 600 $PROJECT_DIR/.env.docker"
fi

log "🎭 Личность (если нет — создаю заглушку)"
if ! ssh_cmd "[ -f $PROJECT_DIR/chat/result_personality.json ]"; then
  scp_cmd /dev/stdin "$PROJECT_DIR/chat/result_personality.json" <<'EOF' >/dev/null 2>&1 || true
{ "patterns":[{"id":"greeting","keywords":["привет","hello","hi"],"responses":["Привет!","Здарова!","Как дела?"],"weight":10,"context":"Приветствие"}],
  "responseStyle":{"averageLength":25,"commonWords":["привет","как","дела"],"commonEmojis":["😊","👋"],"formalityLevel":0.3,"activityLevel":1},
  "schedule":{"activeHours":[9,10,11,12,13,14,15,16,17,18,19,20,21,22],"activeDays":[0,1,2,3,4,5,6]}
}
EOF
fi

log "📜 Сохраняю summary"
ssh_cmd "cat > $PROJECT_DIR/SETUP_SUMMARY.md << EOF
# Synology NAS Setup Summary
## Настройка завершена: $(date)
- Проект: $PROJECT_DIR
- Пользователь: $NAS_USER
- Compose: $COMPOSE_CMD
EOF"

log "✅ Базовый сетап завершён. Дальше используй ./deploy.sh для сборки/запуска"
