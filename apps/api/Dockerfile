FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace manifests
COPY package.json bun.lock* ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/orchestrator/package.json ./packages/orchestrator/

# Install all deps
RUN bun install --frozen-lockfile

# Copy source
COPY packages/db ./packages/db
COPY packages/orchestrator ./packages/orchestrator
COPY apps/api ./apps/api

# Build packages
RUN cd packages/db && bun run build
RUN cd packages/orchestrator && bun run build

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
