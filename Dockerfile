# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.2
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

# Only copy package.json and bun.lock for dependency install
COPY --link package.json ./
COPY --link bun.lock* ./

# Set Bun cache directory
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache

# Install dependencies (production only for builder/final)
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun install --frozen-lockfile --production

# --- Builder stage for TypeScript compilation ---
FROM base AS builder
WORKDIR /app

# Copy the rest of the source code (excluding files in .dockerignore)
COPY --link . ./

# Build the TypeScript project
RUN --mount=type=cache,target=${BUN_INSTALL_CACHE} \
    bun build ./src/index.ts --outdir ../dist --target node

# --- Final minimal image ---
FROM base AS final
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built output and runtime files only
COPY --from=builder /dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

USER appuser

EXPOSE 3000
CMD ["bun", "run", "prod"]
