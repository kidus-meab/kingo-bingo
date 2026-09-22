# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.2.21
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="Next.js/Prisma"

WORKDIR /app

ENV NODE_ENV=production


# ==========================================
# BUILD
# ==========================================
FROM base AS build

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        build-essential \
        openssl \
        pkg-config \
        python3 && \
    rm -rf /var/lib/apt/lists/*

# Dependencies
COPY package.json bun.lock ./

RUN bun install

# Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN bunx --no-install prisma generate

# Application
COPY . .

# Next.js build
RUN bun run build


# ==========================================
# PRODUCTION DEPENDENCIES
# ==========================================
FROM base AS production-deps

COPY package.json bun.lock ./

RUN bun install --production


# ==========================================
# PRODUCTION
# ==========================================
FROM base AS production

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docker-entrypoint.js ./docker-entrypoint.js

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.js"]

CMD ["bun", "run", "start"]