# 1. Base stage
FROM oven/bun:1.4.2-alpine AS base

# 2. Installer stage
FROM base AS installer
WORKDIR /app

COPY dist/apps/worker/package.json dist/apps/worker/bun.lock ./

RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache bun install --production --frozen-lockfile

# 3. Runner stage
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=installer --chown=nestjs:nodejs /app/node_modules ./node_modules

COPY --chown=nestjs:nodejs dist/apps/worker/ .

USER nestjs

CMD ["bun", "main.js"]
