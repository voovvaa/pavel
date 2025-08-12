# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.2

# --- Базовый слой с prod-зависимостями ---
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

# Копируем манифесты отдельно для кэша
COPY --link package.json ./
COPY --link bun.lock* ./

# Кэш для bun
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache \
    NODE_ENV=production

# Prod-зависимости (попадут в финальный образ)
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun install --frozen-lockfile --production

# --- Builder: собираем проект, можно ставить dev-зависимости ---
FROM base AS builder
WORKDIR /app

# Для сборки нам могут понадобиться dev-зависимости
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun install --frozen-lockfile

# Копируем исходники (фильтруются .dockerignore)
COPY --link . ./

# Сборка TypeScript → dist
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun build ./src/index.ts --outdir ./dist --target node

# --- Финальный минимальный образ с prod-зависимостями ---
FROM oven/bun:${BUN_VERSION}-alpine AS final
WORKDIR /app

# Переменные окружения по умолчанию
ENV NODE_ENV=production \
    PORT=3000

# Создаем непривилегированного пользователя
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Копируем только то, что нужно для рантайма
# node_modules и prod-зависимости берём из base
COPY --from=base /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock* ./bun.lock
COPY --from=builder /app/dist ./dist

# Рабочие директории под тома и логи + права
RUN mkdir -p /app/data /app/logs && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Соответствует compose: healthcheck вызывает "bun run health-check --quick"
# Здесь основной запуск:
CMD ["bun", "run", "prod"]