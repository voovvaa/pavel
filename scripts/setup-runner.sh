#!/bin/bash

# Установка GitHub Actions Runner на Synology NAS
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m' 
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"; exit 1; }

# Конфигурация
NAS_IP="192.168.1.70"
NAS_USER="volodya"
SSH_KEY="$HOME/.ssh/synology_github_actions_rsa"
RUNNER_DIR="/volume1/docker/github-runner"

log "🏃‍♂️ Настройка GitHub Actions Runner на NAS"

# Проверяем подключение
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$NAS_USER@$NAS_IP" "echo 'Connected'" > /dev/null 2>&1; then
    error "Не удается подключиться к NAS"
fi

# Запрашиваем токен
echo ""
echo "📋 Получите токен регистрации:"
echo "1. Перейдите: https://github.com/voovvaa/pavel/settings/actions/runners"
echo "2. New self-hosted runner → Linux"
echo "3. Скопируйте токен из команды ./config.sh --url ... --token TOKEN_HERE"
echo ""
read -p "🔑 Введите registration token: " REGISTRATION_TOKEN

if [ -z "$REGISTRATION_TOKEN" ]; then
    error "Токен не может быть пустым"
fi

log "📁 Создаем директории на NAS..."
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
    mkdir -p $RUNNER_DIR
    mkdir -p $RUNNER_DIR/ssh-keys
    mkdir -p $RUNNER_DIR/work
"

log "📤 Копируем конфигурацию runner..."
# Копируем docker-compose с токеном
sed "s/REPLACE_WITH_YOUR_TOKEN/$REGISTRATION_TOKEN/g" docker-compose.runner.yml > /tmp/docker-compose.runner.yml
scp -i "$SSH_KEY" /tmp/docker-compose.runner.yml "$NAS_USER@$NAS_IP:$RUNNER_DIR/docker-compose.yml"
rm /tmp/docker-compose.runner.yml

# Копируем SSH ключи для доступа к самому себе (localhost)
log "🔐 Копируем SSH ключи..."
scp -i "$SSH_KEY" "$SSH_KEY" "$NAS_USER@$NAS_IP:$RUNNER_DIR/ssh-keys/id_rsa"
scp -i "$SSH_KEY" "$SSH_KEY.pub" "$NAS_USER@$NAS_IP:$RUNNER_DIR/ssh-keys/id_rsa.pub"

# Создаем SSH конфигурацию
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
cd $RUNNER_DIR
cat > ssh-keys/config << 'EOF'
Host localhost
    HostName 127.0.0.1
    User $NAS_USER
    IdentityFile ~/.ssh/id_rsa
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF

chmod 600 ssh-keys/id_rsa
chmod 644 ssh-keys/id_rsa.pub ssh-keys/config
"

log "🚀 Запускаем GitHub Actions Runner..."
ssh -i "$SSH_KEY" "$NAS_USER@$NAS_IP" "
cd $RUNNER_DIR
docker compose down --remove-orphans 2>/dev/null || true
docker compose pull
docker compose up -d

echo 'Ждем запуска runner...'
sleep 10

docker compose ps
docker compose logs --tail=20
"

info "✅ GitHub Actions Runner настроен!"
info "📊 Проверьте статус: ssh -i $SSH_KEY $NAS_USER@$NAS_IP 'cd $RUNNER_DIR && docker compose logs -f'"
info "🔗 Runner должен появиться в GitHub: https://github.com/voovvaa/pavel/settings/actions/runners"

echo ""
warn "🔄 Следующий шаг: Обновите workflow для использования self-hosted runner"