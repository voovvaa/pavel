#!/usr/bin/env bash
set -euo pipefail

# --- Цвета/логи ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; PURPLE='\033[0;35m'; NC='\033[0m'
log(){ echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $*${NC}"; }
warn(){ echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $*${NC}"; }
error(){ echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $*${NC}"; exit 1; }
info(){ echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $*${NC}"; }
success(){ echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*${NC}"; }

# --- Аргументы/параметры ---
if [ $# -ne 1 ]; then
  error "Использование: $0 <NAS_IP>"
fi
NAS_IP="$1"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"

# Можно сразу задать репозиторий и ветку (исправь под себя, либо потом в .nas.env на NAS)
REPO_SSH_DEFAULT="${REPO_SSH:-git@github.com:USER/REPO.git}"
BRANCH_DEFAULT="${BRANCH:-main}"

log "🚀 Начинаем настройку Synology NAS для Гейсандра Куловича..."
info "NAS IP: $NAS_IP"
info "SSH User: $NAS_USER"

# --- Проверка доступности NAS ---
log "📡 Проверяем доступность NAS..."
if ! ping -c 2 "$NAS_IP" >/dev/null 2>&1; then warn "Ping не проходит — продолжим по SSH"; fi

# --- Ключи SSH ---
log "🔐 Настраиваем SSH ключи..."
if [ ! -f "$SSH_KEY_PATH" ]; then
  info "Генерируем ключ: $SSH_KEY_PATH"
  ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -C "github-actions@geysandr-bot" -N ""
else
  warn "SSH ключ уже существует: $SSH_KEY_PATH"
fi

log "📤 Копируем публичный ключ на NAS..."
if ssh-copy-id -i "$SSH_KEY_PATH.pub" "$NAS_USER@$NAS_IP" 2>/dev/null; then
  success "SSH ключ скопирован на NAS"
else
  warn "ssh-copy-id не вышел, добавляем вручную"
  ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
  PUB=$(cat "$SSH_KEY_PATH.pub")
  ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "echo '$PUB' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  success "Публичный ключ добавлен"
fi

# --- Тест SSH ---
log "🔑 Тестируем SSH..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" "echo SSH OK" >/dev/null 2>&1 || error "SSH не работает"

# --- Директории ---
log "📁 Создаем структуру директорий на NAS..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "mkdir -p $PROJECT_DIR/{data,logs,chat,backups,scripts} && chmod 755 $PROJECT_DIR $PROJECT_DIR/{data,logs,chat,backups,scripts}"
success "Директории созданы"

# --- Поиск docker + compose ---
log "🐳 Проверяем Docker на NAS..."
DOCKER_BIN=$(ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" '\
for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do
  if [ -x "$d" ]; then echo "$d"; exit 0; fi
done; exit 1' 2>/dev/null || true)
[ -n "$DOCKER_BIN" ] || error "Docker не найден на NAS. Поставь Docker/Container Manager в Package Center."

DOCKER_INFO=$(ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "$DOCKER_BIN --version" 2>/dev/null || true)
success "Docker найден: $DOCKER_INFO"

COMPOSE_CMD=$(ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "\
if $DOCKER_BIN compose version >/dev/null 2>&1; then echo '$DOCKER_BIN compose';
elif command -v docker-compose >/dev/null 2>&1; then echo 'docker-compose';
elif [ -x /usr/local/bin/docker-compose ]; then echo '/usr/local/bin/docker-compose';
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then echo '/var/packages/Docker/target/bin/docker-compose';
else echo ''; fi")
[ -n "$COMPOSE_CMD" ] || error "Не найден docker compose на NAS."
success "Будет использовано: $COMPOSE_CMD"

# --- .env.docker ---
log "⚙️ Создаем базовый .env.docker..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/.env.docker << 'EOF'
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
chmod 600 $PROJECT_DIR/.env.docker"
success ".env.docker создан"

# --- docker-compose.yml (build локально на NAS) ---
log "🐳 Создаем docker-compose.yml..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/docker-compose.yml << 'EOF'
services:
  geysandr-bot:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: geysandr-kylovich-bot
    restart: unless-stopped

    env_file:
      - .env.docker

    volumes:
      - bot-data:/app/data
      - bot-logs:/app/logs
      - ./chat/result_personality.json:/app/chat/result_personality.json:ro

    healthcheck:
      test: [\"CMD\", \"bun\", \"run\", \"health-check\", \"--quick\"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s

    logging:
      driver: json-file
      options:
        max-size: \"50m\"
        max-file: \"3\"

    networks:
      - bot-network

    labels:
      - \"app=geysandr-bot\"
      - \"version=latest\"

volumes:
  bot-data:
    driver: local
    name: geysandr_bot_data
  bot-logs:
    driver: local
    name: geysandr_bot_logs

networks:
  bot-network:
    driver: bridge
    name: geysandr_network
EOF"
success "docker-compose.yml создан"

# --- Базовая личность ---
log "🎭 Создаем заглушку личности..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/chat/result_personality.json << 'EOF'
{ \"patterns\":[{\"id\":\"greeting\",\"keywords\":[\"привет\",\"hello\",\"hi\"],\"responses\":[\"Привет!\",\"Здарова!\",\"Как дела?\"],\"weight\":10,\"context\":\"Приветствие\"}],
  \"responseStyle\":{\"averageLength\":25,\"commonWords\":[\"привет\",\"как\",\"дела\"],\"commonEmojis\":[\"😊\",\"👋\"],\"formalityLevel\":0.3,\"activityLevel\":1},
  \"schedule\":{\"activeHours\":[9,10,11,12,13,14,15,16,17,18,19,20,21,22],\"activeDays\":[0,1,2,3,4,5,6]}
}
EOF"
success "Базовая личность создана"

# --- .nas.env на NAS (для deploy.sh) ---
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/.nas.env << EOF
NAS_IP=$NAS_IP
NAS_USER=$NAS_USER
SSH_KEY_PATH=$SSH_KEY_PATH
PROJECT_DIR=$PROJECT_DIR
REPO_SSH=$REPO_SSH_DEFAULT
BRANCH=$BRANCH_DEFAULT
EOF"
success "Создан $PROJECT_DIR/.nas.env (исправь REPO_SSH/BRANCH при необходимости)"

# --- Скрипты деплоя: setup-git-auth.sh + deploy.sh + update.sh + backup.sh + import-chat-history.sh + autostart.sh ---
log "📜 Кладем скрипты деплоя на NAS..."

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/setup-git-auth.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
NAS_IP="\${NAS_IP:-}"; NAS_USER="\${NAS_USER:-volodya}"; SSH_KEY_PATH="\${SSH_KEY_PATH:-\$HOME/.ssh/synology_github_actions}"
DEPLOY_KEY_LOCAL="\${1:-}"; REPO_SSH="\${REPO_SSH:-git@github.com:USER/REPO.git}"
log(){ printf '\\033[0;32m[%(%F %T)T] %s\\033[0m\\n' -1 \"\$*\"; }; error(){ printf '\\033[0;31m[%(%F %T)T] ❌ %s\\033[0m\\n' -1 \"\$*\"; exit 1; }
[ -n \"\$DEPLOY_KEY_LOCAL\" ] && [ -f \"\$DEPLOY_KEY_LOCAL\" ] || error \"Укажи путь к приватному ключу (первый аргумент)\"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cp \"\$DEPLOY_KEY_LOCAL\" ~/.ssh/id_repo && chmod 600 ~/.ssh/id_repo
ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true && chmod 600 ~/.ssh/known_hosts
{ echo 'Host github.com'; echo '  HostName github.com'; echo '  User git'; echo '  IdentityFile ~/.ssh/id_repo'; echo '  IdentitiesOnly yes'; } >> ~/.ssh/config
chmod 600 ~/.ssh/config
log \"Готово. Добавь публичный ключ в Deploy Keys репозитория: \$REPO_SSH\"
EOF"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/deploy.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; [ -f .nas.env ] && source .nas.env || true; set +a
NAS_IP=\"\${NAS_IP:-}\"; NAS_USER=\"\${NAS_USER:-volodya}\"; SSH_KEY_PATH=\"\${SSH_KEY_PATH:-\$HOME/.ssh/synology_github_actions}\"
PROJECT_DIR=\"\${PROJECT_DIR:-/volume1/docker/geysandr-bot}\"; REPO_SSH=\"\${REPO_SSH:-git@github.com:USER/REPO.git}\"; BRANCH=\"\${BRANCH:-main}\"
log(){ printf '\\033[0;32m[%(%F %T)T] %s\\033[0m\\n' -1 \"\$*\"; }; warn(){ printf '\\033[1;33m[%(%F %T)T] ⚠️  %s\\033[0m\\n' -1 \"\$*\"; }; error(){ printf '\\033[0;31m[%(%F %T)T] ❌ %s\\033[0m\\n' -1 \"\$*\"; exit 1; }
# Определяем docker/compose
DOCKER_BIN=\"\$(for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do [ -x \"\$d\" ] && { echo \"\$d\"; break; }; done)\"
[ -n \"\$DOCKER_BIN\" ] || error \"Docker не найден\"
if \$DOCKER_BIN compose version >/dev/null 2>&1; then COMPOSE_CMD=\"\$DOCKER_BIN compose\";
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD=\"docker-compose\";
elif [ -x /usr/local/bin/docker-compose ]; then COMPOSE_CMD=\"/usr/local/bin/docker-compose\";
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then COMPOSE_CMD=\"/var/packages/Docker/target/bin/docker-compose\"; else error \"compose не найден\"; fi
log \"Compose: \$COMPOSE_CMD\"
# Git clone/pull
cd \"\$PROJECT_DIR\"
if [ -d .git ]; then
  log \"Обновляю репозиторий\"
  git remote set-url origin \"\$REPO_SSH\" || true
  git fetch --all --prune
  git reset --hard \"origin/\$BRANCH\"
  git clean -fdx
else
  log \"Клонирую \$REPO_SSH (ветка \$BRANCH)\"
  git clone --depth 1 -b \"\$BRANCH\" \"\$REPO_SSH\" \"\$PROJECT_DIR\"
  cd \"\$PROJECT_DIR\"
fi
# Build & Up
log \"Сборка образов\"
\$COMPOSE_CMD -f docker-compose.yml build --pull
log \"Старт контейнеров\"
\$COMPOSE_CMD -f docker-compose.yml up -d
# Health-check (если есть)
if \$COMPOSE_CMD run --rm geysandr-bot bun run health-check --quick >/dev/null 2>&1; then
  log \"✅ Health-check OK\"
else
  warn \"Health-check не прошёл/отсутствует — показываю логи\"
  \$COMPOSE_CMD logs --tail=200 geysandr-bot || true
fi
EOF"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/update.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; [ -f .nas.env ] && source .nas.env || true; set +a
PROJECT_DIR=\"\${PROJECT_DIR:-/volume1/docker/geysandr-bot}\"
DOCKER_BIN=\"\$(for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do [ -x \"\$d\" ] && { echo \"\$d\"; break; }; done)\"
[ -n \"\$DOCKER_BIN\" ] || { echo \"Docker не найден\"; exit 1; }
if \$DOCKER_BIN compose version >/dev/null 2>&1; then COMPOSE_CMD=\"\$DOCKER_BIN compose\";
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD=\"docker-compose\";
elif [ -x /usr/local/bin/docker-compose ]; then COMPOSE_CMD=\"/usr/local/bin/docker-compose\";
elif [ -x /var/packages/Docker/target/bin/docker-compose ]; then COMPOSE_CMD=\"/var/packages/Docker/target/bin/docker-compose\"; else echo \"compose не найден\"; exit 1; fi
cd \"\$PROJECT_DIR\" && \$COMPOSE_CMD build --pull && \$COMPOSE_CMD up -d
EOF"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/backup.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; [ -f .nas.env ] && source .nas.env || true; set +a
PROJECT_DIR=\"\${PROJECT_DIR:-/volume1/docker/geysandr-bot}\"; KEEP=\"\${KEEP:-10}\"
TS=\"\$(date +%Y%m%d_%H%M%S)\"
cd \"\$PROJECT_DIR\"
tar -czf \"backups/backup_\$TS.tar.gz\" data/ chat/ .env.docker docker-compose.yml 2>/dev/null || true
ls -1t backups/backup_*.tar.gz | tail -n +\$((KEEP+1)) | xargs -r rm -f
echo \"Готово: backups/backup_\$TS.tar.gz\"
EOF"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/import-chat-history.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
FILE=\"\${1:-}\"; [ -n \"\$FILE\" ] && [ -f \"\$FILE\" ] || { echo \"Укажи файл личности\"; exit 1; }
set -a; [ -f .nas.env ] && source .nas.env || true; set +a
PROJECT_DIR=\"\${PROJECT_DIR:-/volume1/docker/geysandr-bot}\"
cp \"\$FILE\" \"\$PROJECT_DIR/chat/result_personality.json\"
DOCKER_BIN=\"\$(for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do [ -x \"\$d\" ] && { echo \"\$d\"; break; }; done)\"
if \$DOCKER_BIN compose version >/dev/null 2>&1; then COMPOSE_CMD=\"\$DOCKER_BIN compose\"; else COMPOSE_CMD=\"docker-compose\"; fi
cd \"\$PROJECT_DIR\" && \$COMPOSE_CMD up -d
EOF"

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cat > $PROJECT_DIR/scripts/autostart.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; [ -f .nas.env ] && source .nas.env || true; set +a
PROJECT_DIR=\"\${PROJECT_DIR:-/volume1/docker/geysandr-bot}\"
DOCKER_BIN=\"\$(for d in docker /usr/local/bin/docker /var/packages/Docker/target/usr/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do [ -x \"\$d\" ] && { echo \"\$d\"; break; }; done)\"
if \$DOCKER_BIN compose version >/dev/null 2>&1; then COMPOSE_CMD=\"\$DOCKER_BIN compose\"; else COMPOSE_CMD=\"docker-compose\"; fi
cd \"\$PROJECT_DIR\" && \$COMPOSE_CMD up -d
EOF"

# --- Права на скрипты ---
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "chmod +x $PROJECT_DIR/scripts/*.sh"

# --- Валидация compose ---
info "Проверяем конфигурацию Docker Compose..."
if ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "cd $PROJECT_DIR && $COMPOSE_CMD -f docker-compose.yml config" >/dev/null 2>&1; then
  success "Docker Compose конфигурация валидна"
else
  warn "Docker Compose конфигурация может содержать ошибки"
fi

# --- Summary ---
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" "bash -lc 'cat > $PROJECT_DIR/SETUP_SUMMARY.md <<EOF
# Synology NAS Setup Summary

## Настройка завершена: \$(date)

### Директории:
- $PROJECT_DIR/data
- $PROJECT_DIR/logs
- $PROJECT_DIR/chat
- $PROJECT_DIR/backups
- $PROJECT_DIR/scripts

### Файлы:
- .env.docker
- docker-compose.yml
- chat/result_personality.json
- scripts: setup-git-auth.sh, deploy.sh, update.sh, backup.sh, import-chat-history.sh, autostart.sh
- .nas.env

### Docker:
- \$(/usr/local/bin/docker --version 2>/dev/null || docker --version 2>/dev/null || echo docker not found)
- \$(/usr/local/bin/docker compose version 2>/dev/null || docker compose version 2>/dev/null || /usr/local/bin/docker-compose --version 2>/dev/null || echo compose not found)

EOF'"
success "🎉 Настройка Synology NAS завершена!"
info "📄 Summary: $PROJECT_DIR/SETUP_SUMMARY.md"

echo
info "Дальше:"
echo "1) На NAS: заполнить $PROJECT_DIR/.env.docker реальными токенами"
echo "2) На NAS: отредактировать $PROJECT_DIR/.nas.env (REPO_SSH, BRANCH)"
echo "3) На NAS: добавить deploy key в GitHub и выполнить:"
echo "   $PROJECT_DIR/scripts/setup-git-auth.sh /path/to/private_deploy_key"
echo "4) Локально (на твоём компе):"
echo "   ssh -i $SSH_KEY_PATH $NAS_USER@$NAS_IP 'bash $PROJECT_DIR/scripts/deploy.sh'"