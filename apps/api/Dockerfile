# Multi-stage build for the NestJS API.
# Build context must be the repo root (so the workspace lockfile + shared package are visible).
#   docker build -f apps/api/Dockerfile -t funny-movies-api .

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=10.15.0

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace

# ---- deps: install full workspace deps (cached when manifests don't change) ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false

# ---- builder: compile shared, generate prisma client, build api ----
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @remitano/shared build \
    && pnpm --filter api exec prisma generate \
    && pnpm --filter api build

# ---- runtime: minimal layer that runs migrate + node main ----
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# pnpm-resolved node_modules (with the generated Prisma client) and built artifacts.
COPY --from=builder /workspace/node_modules /app/node_modules
COPY --from=builder /workspace/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /workspace/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=builder /workspace/apps/api/dist /app/apps/api/dist
COPY --from=builder /workspace/apps/api/prisma /app/apps/api/prisma
COPY --from=builder /workspace/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /workspace/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /workspace/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /workspace/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /workspace/package.json /app/package.json

WORKDIR /app/apps/api
EXPOSE 3001

# `prisma migrate deploy` runs first so a fresh DB gets the schema applied;
# subsequent boots are a no-op when migrations are already current.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
