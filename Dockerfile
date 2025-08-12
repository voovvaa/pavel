# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.2
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

# Copy lockfiles first for better caching
COPY --link package.json ./
COPY --link bun.lock* ./

# Install only production deps (bun)
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} bun install --frozen-lockfile --production

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY --link . ./
# Build TS → /app/dist (all utilities for production)
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun build ./src/index.ts --outdir /app/dist --target node && \
    bun build ./src/utils/health-check.ts --outdir /app/dist/utils --target node && \
    bun build ./src/memory/memory-viewer.ts --outdir /app/dist/memory --target node && \
    bun build ./src/utils/cache-analyzer.ts --outdir /app/dist/utils --target node && \
    bun build ./src/utils/import-history.js --outdir /app/dist/utils --target node

# ---- Final ----
FROM base AS final
WORKDIR /app

# Create runtime dirs and non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/data /app/logs /app/chat && \
    chown -R appuser:appgroup /app

# Copy built app and runtime manifests
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock* ./

USER appuser

EXPOSE 3000
CMD ["bun","run","prod"]
