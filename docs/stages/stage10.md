# ЭТАП 10: CI/CD и Production Deployment

**Статус: 🔄 В РАЗРАБОТКЕ**

## 🎯 Обзор

Этап 10 финализирует проект созданием полноценной CI/CD системы для автоматического деплоя на Synology NAS с Docker контейнеризацией, мониторингом и автоматическими обновлениями.

## 🏗️ Архитектура деплоя

### Целевая инфраструктура:
- **Synology NAS** - основной сервер
- **Docker Compose** - контейнеризация
- **GitHub Actions** - CI/CD pipeline
- **Watchtower** - автообновления контейнеров
- **Prometheus + Grafana** - мониторинг
- **Nginx Proxy Manager** - reverse proxy

## 🐳 Docker контейнеризация

### Структура контейнеров:
```yaml
services:
  geisandr-bot:
    build: .
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    
  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  prometheus:
    image: prom/prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    restart: unless-stopped
    
  grafana:
    image: grafana/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped
```

### Dockerfile:
```dockerfile
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Build
COPY . .
RUN bun run build

# Production
FROM oven/bun:1-alpine AS production
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER 1000
EXPOSE 3000
CMD ["bun", "start"]
```

## ⚙️ CI/CD Pipeline

### GitHub Actions Workflow:
```yaml
name: Deploy Geisandr Bot

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run type-check
      - run: bun run test-ai
      - run: bun run health-check

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t geisandr-bot:${{ github.sha }} .
      - name: Push to registry
        run: |
          docker tag geisandr-bot:${{ github.sha }} registry.local/geisandr-bot:latest
          docker push registry.local/geisandr-bot:latest

  deploy:
    needs: build
    runs-on: self-hosted # Synology NAS runner
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: |
          cd /volume1/docker/geisandr-bot
          docker-compose pull
          docker-compose up -d
          docker system prune -f
```

## 📊 Мониторинг и алертинг

### Метрики для отслеживания:
```yaml
# Prometheus метрики
geisandr_messages_processed_total
geisandr_ai_requests_total
geisandr_response_time_seconds
geisandr_memory_usage_bytes
geisandr_database_size_bytes
geisandr_openai_tokens_used_total
geisandr_openai_cost_usd_total
geisandr_uptime_seconds
```

### Grafana Dashboard:
- **Общая активность** - сообщения в час, ответы бота
- **AI метрики** - использование токенов, стоимость, время ответа
- **Система** - CPU, RAM, место на диске
- **Ошибки** - rate ошибок, типы ошибок
- **База данных** - размер, количество записей, время запросов

### Алерты:
```yaml
alerts:
  - name: Bot Down
    condition: up{job="geisandr-bot"} == 0
    for: 2m
    
  - name: High Error Rate
    condition: rate(geisandr_errors_total[5m]) > 0.1
    for: 5m
    
  - name: High OpenAI Cost
    condition: increase(geisandr_openai_cost_usd_total[1h]) > 5
    for: 1m
    
  - name: Memory Usage High
    condition: geisandr_memory_usage_bytes > 2GB
    for: 10m
```

## 🔐 Секреты и конфигурация

### Environment управление:
```bash
# Production secrets
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN_PROD}
OPENAI_API_KEY=${OPENAI_API_KEY_PROD}
DATABASE_URL=sqlite:///data/memory.db
REDIS_URL=redis://redis:6379

# Monitoring
PROMETHEUS_URL=http://prometheus:9090
GRAFANA_URL=http://grafana:3000

# Alerts
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
EMAIL_SMTP_HOST=${EMAIL_SMTP_HOST}
```

### Secrets управление:
- **GitHub Secrets** для CI/CD переменных
- **Docker Secrets** для production окружения
- **Encrypted .env** файлы с ansible-vault
- **Rotация ключей** каждые 90 дней

## 🚀 Deployment стратегии

### Blue-Green Deployment:
```bash
# Скрипт blue-green деплоя
#!/bin/bash

CURRENT=$(docker-compose ps -q geisandr-bot)
NEW_VERSION=$1

# Start new version
docker-compose -f docker-compose.blue.yml up -d
sleep 30

# Health check
if curl -f http://localhost:3001/health; then
    # Switch traffic
    docker-compose -f docker-compose.yml down
    mv docker-compose.blue.yml docker-compose.yml
    echo "Deployment successful"
else
    # Rollback
    docker-compose -f docker-compose.blue.yml down
    echo "Deployment failed, rolled back"
    exit 1
fi
```

### Rolling Updates:
```yaml
# Watchtower для автообновлений
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - WATCHTOWER_POLL_INTERVAL=300
    - WATCHTOWER_CLEANUP=true
  restart: unless-stopped
```

## 📋 Backup и восстановление

### Automated Backups:
```bash
#!/bin/bash
# Backup скрипт
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/volume1/backups/geisandr-bot"

# Database backup
sqlite3 /volume1/docker/geisandr-bot/data/memory.db ".backup ${BACKUP_DIR}/memory_${DATE}.db"

# Config backup
tar -czf "${BACKUP_DIR}/config_${DATE}.tar.gz" \
  /volume1/docker/geisandr-bot/*.yml \
  /volume1/docker/geisandr-bot/.env

# Cleanup old backups (keep 30 days)
find ${BACKUP_DIR} -name "*.db" -mtime +30 -delete
find ${BACKUP_DIR} -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: ${DATE}"
```

### Disaster Recovery:
```bash
#!/bin/bash
# Recovery скрипт
BACKUP_DATE=$1

# Stop services
docker-compose down

# Restore database
cp "/volume1/backups/geisandr-bot/memory_${BACKUP_DATE}.db" \
   "/volume1/docker/geisandr-bot/data/memory.db"

# Restore config
tar -xzf "/volume1/backups/geisandr-bot/config_${BACKUP_DATE}.tar.gz" \
    -C /volume1/docker/geisandr-bot/

# Start services
docker-compose up -d

echo "Recovery completed from: ${BACKUP_DATE}"
```

## 🔧 Команды для этапа 10

### Development:
```bash
# Локальное тестирование Docker
bun run docker:build
bun run docker:run
bun run docker:test

# CI/CD тестирование
bun run ci:test-local
bun run ci:build-local
```

### Deployment:
```bash
# Manual deploy
bun run deploy:staging
bun run deploy:production

# Monitoring
bun run monitoring:start
bun run monitoring:dashboard

# Maintenance
bun run backup:create
bun run backup:restore
bun run logs:tail
```

## 📈 Метрики успеха этапа 10

### ✅ Критерии готовности:
- **Автоматический деплой** - push to main → production за 5 минут
- **Zero-downtime** - обновления без остановки сервиса
- **Monitoring** - полная видимость в Grafana dashboards  
- **Alerting** - уведомления в Slack при проблемах
- **Backups** - автоматические ежедневные бэкапы
- **Security** - encrypted secrets, isolated containers
- **Performance** - время отклика < 2 секунд

### 📊 KPI:
- **Uptime:** >99.5%
- **Deploy time:** <5 минут
- **Recovery time:** <10 минут  
- **Backup success rate:** 100%
- **Alert response time:** <2 минуты

## 🔮 Будущие улучшения

### Этап 11: Масштабирование
- **Kubernetes** для orchestration
- **Multi-region** deployment
- **Load balancing** для multiple instances
- **Auto-scaling** по нагрузке

### Дополнительные возможности:
- **Blue-green** в Kubernetes
- **Canary deployments** с traffic splitting
- **Integration tests** в production-like среде
- **Performance testing** в CI/CD pipeline

## 🛡️ Security checklist

### ✅ Production Security:
- **Container security** - non-root user, minimal image
- **Network security** - internal Docker networks
- **Secrets management** - encrypted at rest
- **Access control** - SSH keys, VPN only
- **Audit logging** - все действия логируются
- **Vulnerability scanning** - автоматическое сканирование образов

---

**🎯 Цель этапа 10:** Превратить проект в **production-ready сервис** с автоматическим деплоем, мониторингом и высокой доступностью на собственной инфраструктуре Synology NAS.

**📅 Планируемая дата завершения:** 15 августа 2025  
**🏷️ Результат:** Полностью автоматизированная система деплоя и мониторинга