# 🚨 Проблемы деплоя и их решения

> **Дата:** 12 августа 2025  
> **Статус:** Решены все критические проблемы  
> **Результат:** Успешный деплой на Synology NAS

---

## 📋 Обзор найденных проблем

В процессе деплоя на Synology NAS были выявлены и исправлены следующие критические проблемы:

### 🔴 Критические проблемы (исправлены)

1. **Несуществующий volume mount в docker-compose.yml**
2. **Неправильная health-check команда** 
3. **Неполная компиляция утилит в Dockerfile**
4. **Отсутствие REPO_SSH в конфигурации**
5. **Проблемы с JSON файлом личности**

### 🟡 Умеренные проблемы (исправлены)

6. **SCP ограничения на Synology**
7. **Права доступа к директориям**
8. **Fallback механизмы в package.json**

---

## 🔧 Детальные решения

### 1. 🗂️ Volume mount в docker-compose.yml

**Проблема:**
```yaml
# НЕПРАВИЛЬНО - директория не существует
volumes:
  - ./data/chat:/app/data/chat
```

**Ошибка:**
```
Bind mount failed: '/volume1/docker/geysandr-bot/data/chat' does not exist
```

**Решение:**
```yaml
# ПРАВИЛЬНО - используем существующую директорию
volumes:
  - ./chat:/app/chat:ro
```

**Статус:** ✅ Исправлено в docker-compose.yml

---

### 2. 🏥 Health-check команда

**Проблема:**
```yaml
# НЕПРАВИЛЬНО - не работает в production контейнере
test: ["CMD", "bun", "run", "health-check", "--quick"]
```

**Ошибка:**
```
error: script "health-check" exited with code 1
```

**Решение:**
```yaml
# ПРАВИЛЬНО - указываем рабочую директорию
test: ["CMD", "sh", "-c", "cd /app && bun run health-check --quick"]
```

**Статус:** ✅ Исправлено в docker-compose.yml

---

### 3. 🛠️ Компиляция утилит в Dockerfile

**Проблема:**
```dockerfile
# НЕПРАВИЛЬНО - компилируется только основной файл
RUN bun build ./src/index.ts --outdir /app/dist --target node
```

**Ошибка:**
```
error: Module not found "src/utils/health-check.ts"
```

**Решение:**
```dockerfile
# ПРАВИЛЬНО - компилируем все утилиты
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun build ./src/index.ts --outdir /app/dist --target node && \
    bun build ./src/utils/health-check.ts --outdir /app/dist/utils --target node && \
    bun build ./src/memory/memory-viewer.ts --outdir /app/dist/memory --target node && \
    bun build ./src/utils/cache-analyzer.ts --outdir /app/dist/utils --target node
```

**Статус:** ✅ Исправлено в Dockerfile

---

### 4. 🔑 Переменная REPO_SSH в .nas.env

**Проблема:**
```bash
[2025-08-12 22:07:50] ❌ REPO_SSH не задан (в /volume1/docker/geysandr-bot/.nas.env)
```

**Решение:**
```bash
# Добавили в .nas.env
REPO_SSH=git@github.com:voovvaa/pavel.git
BRANCH=main
PROJECT_DIR=/volume1/docker/geysandr-bot
```

**Статус:** ✅ Исправлено в setup-synology.sh

---

### 5. 📄 JSON файл личности

**Проблема:**
```json
{
  "responses":["Привет\!","Здарова\!"]
}
```

**Ошибка:**
```
SyntaxError: JSON Parse error: Invalid escape character !
```

**Решение:**
```json
{
  "responses":["Привет","Здарова","Как дела"]
}
```

**Статус:** ✅ Исправлено - убраны лишние экранирования

---

### 6. 📤 SCP ограничения на Synology

**Проблема:**
```bash
scp: dest open "/volume1/docker/geysandr-bot/": No such file or directory
```

**Решение:**
Заменили SCP на SSH + редирект:
```bash
# Вместо SCP
ssh user@nas "cat > /path/to/file" < local_file

# Для всех скриптов
for script in ./scripts/*.sh; do
  filename=$(basename "$script")
  ssh user@nas "cat > /volume1/docker/geysandr-bot/scripts/$filename" < "$script"
done
```

**Статус:** ✅ Исправлено в setup-synology.sh

---

### 7. 🔐 Права доступа к директориям

**Проблема:**
```bash
drwxr-xr-x  1 volodya users   90 Aug 12 22:22 geysandr-bot
```

**Решение:**
```bash
# Исправили права
chmod 755 /volume1/docker/geysandr-bot
chmod +x /volume1/docker/geysandr-bot/scripts/*.sh
```

**Статус:** ✅ Исправлено автоматически в setup-synology.sh

---

### 8. 🔄 Fallback механизмы в package.json

**Проблема:**
Утилиты не работали в production контейнере из-за отсутствия source файлов.

**Решение:**
```json
{
  "scripts": {
    "health-check": "NODE_ENV=production bun run dist/utils/health-check.js || bun run src/utils/health-check.ts",
    "memory-stats": "NODE_ENV=production bun run dist/memory/memory-viewer.js || bun run src/memory/memory-viewer.ts",
    "cache-stats": "NODE_ENV=production bun run dist/utils/cache-analyzer.js || bun run src/utils/cache-analyzer.ts"
  }
}
```

**Статус:** ✅ Исправлено - добавлены fallback к source файлам

---

### 9. 💾 Docker Volume Mount и persistence базы данных

**Проблема:**
База данных создавалась успешно (41,953 сообщений), но не сохранялась в Docker volume. 

**Корневая причина:**
NODE_ENV не передавался в контейнер, import-history.js создавал базу в `./memory.db` вместо `/app/data/memory.db`

**Диагностические симптомы:**
```bash
# Импорт показывал успех
📊 Импортировано: 42134 сообщений
📈 Итоговая статистика базы данных:
💬 Всего сообщений: 41953

# Но база не сохранялась в volume
ls /app/data/ # пусто!
```

**Решение:**
1. **Исправлен скрипт import-history.js:**
```javascript
// Определяем режим работы из переменной или аргумента
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const dbPath = isProduction
  ? '/app/data/memory.db'  // Правильный путь для volume
  : './memory.db';
```

2. **Добавлена принудительная синхронизация SQLite:**
```javascript
db.run('PRAGMA wal_checkpoint(FULL)'); // Принудительно записываем WAL файл
db.run('PRAGMA optimize');
```

3. **Исправлены команды запуска:**
```bash
# СТАРАЯ команда (неправильная)
NODE_ENV=production docker compose run --rm geysandr-bot bun dist/utils/import-history.js

# НОВАЯ команда (правильная)
docker compose run --rm -v geysandr_bot_data:/app/data geysandr-bot bun dist/utils/import-history.js --production
```

4. **Обновлен package.json:**
```json
{
  "scripts": {
    "import-history": "bun run dist/utils/import-history.js --production || bun run src/utils/import-history.js --production"
  }
}
```

**Статус:** ✅ Исправлено - база корректно сохраняется в volume (13.5MB, 41,953 сообщений)

---

## 🚀 Итоговая последовательность деплоя

### Рабочий процесс:

1. **Инициализация NAS:**
   ```bash
   ./scripts/setup-synology.sh 192.168.1.70
   ```

2. **Настройка GitHub Deploy Key:**
   - Добавить публичный ключ в GitHub Deploy Keys
   - Включить Write access

3. **Настройка Git на NAS:**
   ```bash
   ssh -i ~/.ssh/synology_github_actions user@nas \
     "cd /volume1/docker/geysandr-bot && ./scripts/setup-git-auth.sh ~/.ssh/id_rsa"
   ```

4. **Деплой:**
   ```bash
   ssh -i ~/.ssh/synology_github_actions user@nas \
     "cd /volume1/docker/geysandr-bot && ./scripts/deploy.sh"
   ```

5. **Проверка:**
   ```bash
   docker compose ps
   docker compose logs -f geysandr-bot
   ```

---

## 📊 Результат деплоя

### ✅ Успешный запуск:
```
geysandr-kylovich-bot  | [12.08.2025, 22:37:25] INFO: ✅ Гейсандр Кулович изучил свой характер: 50 особенностей
geysandr-kylovich-bot  | [12.08.2025, 22:37:25] INFO: Режим работы: hybrid (модель: gpt-5-chat-latest)
geysandr-kylovich-bot  | [12.08.2025, 22:37:25] INFO: 🧠 Гейсандр Кулович вспомнил свой характер и готов к общению!
```

### 📈 Статистика:
- **Личность:** 50 паттернов загружено
- **AI режим:** Hybrid с GPT-5 chat-latest
- **Память:** SQLite база готова (94KB)
- **Health status:** DEGRADED (нормально для первого запуска)
- **Контейнер:** Запущен и стабилен

---

## 🔄 Обновления и апдейты

### Команды для будущих обновлений:

```bash
# Быстрое обновление без пересборки
./scripts/update.sh

# Полный деплой с пересборкой
./scripts/deploy.sh

# Импорт новых данных чата и актуализация (ИСПРАВЛЕНО)
./scripts/import-data-to-nas.sh <NAS_IP>
# или через npm
bun run import-data <NAS_IP>

# Прямой запуск импорта с правильным volume mount
docker compose run --rm -v geysandr_bot_data:/app/data geysandr-bot bun run import-history --production

# Бэкап перед обновлением
./scripts/backup.sh

# Мониторинг
docker compose logs -f geysandr-bot
docker compose ps
```

### 📊 Автоматизированный импорт данных

Создан скрипт `scripts/import-data-to-nas.sh` который автоматизирует:

1. **Остановку контейнера** на NAS
2. **Копирование файлов чата:**
   - `chat/result.json` (24MB) - экспорт Telegram
   - `chat/result_analysis.json` (28KB) - анализ для личности
   - `chat/result_personality.json` (32KB) - готовая личность
   - `src/utils/import-history.js` - скрипт импорта
3. **Импорт истории** в новую базу данных SQLite
4. **Регенерацию личности** из актуальных данных
5. **Запуск контейнера** с обновленными данными

**Использование:**
```bash
# Автоматический импорт
bun run import-data 192.168.1.70

# Ручной запуск
./scripts/import-data-to-nas.sh 192.168.1.70
```

---

## 📝 Уроки и улучшения

### Что было изучено:
1. **Synology специфика** - особенности работы с Docker на NAS
2. **Volume mounting** - правильные пути и права доступа
3. **Multi-stage builds** - компиляция всех необходимых утилит
4. **Health checks** - корректные команды для production контейнеров
5. **SSH ключи** - настройка Deploy Keys для автоматизации

### Улучшения в инфраструктуре:
- ✅ Автоматический скрипт полной инициализации NAS
- ✅ Правильные fallback механизмы в package.json
- ✅ Исправленные Docker конфигурации
- ✅ Обновленная документация с актуальными командами

---

**Статус проекта:** 🟢 **Production Ready**  
**Гейсандр Кулович успешно развернут и готов к работе!** 🚀

---

## 📋 Краткое резюме решений

### ✅ **Все критические проблемы решены:**
1. **Volume mount** - исправлены пути в docker-compose.yml
2. **Health-check** - обновлена команда для production контейнера  
3. **Утилиты** - все скрипты компилируются в Dockerfile
4. **SSH конфигурация** - настроены Deploy Keys для автоматизации
5. **JSON парсинг** - убраны лишние экранирования в файлах личности
6. **SCP ограничения** - заменены на SSH + редирект для Synology
7. **Права доступа** - автоматически настраиваются в скриптах
8. **Fallback механизмы** - добавлены для всех утилит в package.json
9. **📍 Docker Volume Persistence** - исправлена передача NODE_ENV и пути к базе данных

### 🎯 **Ключевое исправление Volume Mount:**
- **Проблема:** База данных импортировалась (41,953 сообщений), но не сохранялась в Docker volume
- **Причина:** NODE_ENV не передавался, база создавалась в `./memory.db` вместо `/app/data/memory.db`
- **Решение:** Добавлен флаг `--production` в import-history.js + правильные volume mount команды
- **Результат:** База корректно сохраняется (13.5MB) и доступна между запусками контейнера

### 🚀 **Рабочие команды для импорта данных:**
```bash
# Полный автоматический импорт на NAS
./scripts/import-data-to-nas.sh 192.168.1.70

# Прямой импорт с правильным volume mount
docker compose run --rm -v geysandr_bot_data:/app/data geysandr-bot bun run import-history --production

# Проверка импортированных данных
docker compose run --rm -v geysandr_bot_data:/app/data geysandr-bot bun -e "
  import { Database } from 'bun:sqlite';
  const db = new Database('/app/data/memory.db');
  const result = db.prepare('SELECT DISTINCT chat_id, COUNT(*) as count FROM messages GROUP BY chat_id').all();
  console.log('Imported chats:', result);
"
```

### 📊 **Итоговые метрики:**
- **Импортировано сообщений:** 41,953 из 42,134
- **Создано тем:** 22,762
- **Пользователей в базе:** 9  
- **Размер базы данных:** 13.5MB
- **Chat ID:** 1460632856
- **Статус системы:** HEALTHY ✅

**🎉 Все системы работают! Гейсандр Кулович готов к полноценному общению с историей чата!**