#!/usr/bin/env bash
set -euo pipefail

# --- Цвета/логи ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; PURPLE='\033[0;35m'; NC='\033[0m'
log(){ echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $*${NC}"; }
warn(){ echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $*${NC}"; }
error(){ echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $*${NC}"; exit 1; }
info(){ echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $*${NC}"; }
success(){ echo -e "${PURPLE}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $*${NC}"; }

# --- Аргументы ---
if [ $# -ne 1 ]; then
  error "Использование: $0 <NAS_IP>"
fi
NAS_IP="$1"
NAS_USER="${NAS_USER:-volodya}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/synology_github_actions}"
PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/geysandr-bot}"

log "🔧 Миграция базы данных на NAS ($NAS_IP)"

# --- Добавляем колонку context в базу данных ---
log "📊 Добавляем колонку context в базу данных..."

ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose run --rm -v geysandr_bot_data:/app/data geysandr-bot bun -e \"
console.log('🔧 Миграция базы данных...');
import { Database } from 'bun:sqlite';

try {
  const db = new Database('/app/data/memory.db');
  
  // Проверяем структуру таблицы
  const columns = db.prepare('PRAGMA table_info(messages)').all();
  console.log('📊 Текущие колонки:', columns.map(c => c.name));
  
  // Проверяем есть ли колонка context
  const hasContext = columns.some(col => col.name === 'context');
  
  if (hasContext) {
    console.log('✅ Колонка context уже существует');
  } else {
    console.log('➕ Добавляем колонку context...');
    db.exec('ALTER TABLE messages ADD COLUMN context TEXT');
    console.log('✅ Колонка context добавлена');
  }
  
  // Проверяем результат
  const newColumns = db.prepare('PRAGMA table_info(messages)').all();
  console.log('📊 Обновленные колонки:', newColumns.map(c => c.name));
  
  db.close();
  console.log('🎉 Миграция завершена успешно!');
  
} catch (error) {
  console.log('❌ Ошибка миграции:', error.message);
  process.exit(1);
}
\""

success "🎉 Миграция базы данных завершена!"

log "🔄 Перезапускаем контейнер для применения изменений..."
ssh -i "$SSH_KEY_PATH" "$NAS_USER@$NAS_IP" \
  "cd $PROJECT_DIR && /usr/local/bin/docker compose restart"

success "✅ Контейнер перезапущен - готов к тестированию!"