FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace manifests
COPY package.json bun.lock* ./
COPY turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/

# Install all deps
RUN bun install --frozen-lockfile

# Copy source
COPY packages/db ./packages/db
COPY packages/ui ./packages/ui
COPY apps/web ./apps/web

# Build packages
RUN cd packages/db && bun run build
RUN cd packages/ui && bun run build

# Build Next.js app
WORKDIR /app/apps/web
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3002

CMD ["bun", "run", "start"]
