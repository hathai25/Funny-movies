# Multi-stage build for the React + Vite SPA, served by nginx.
# Build context must be the repo root (so the workspace lockfile + shared package are visible).
#   docker build -f apps/web/Dockerfile -t funny-movies-web .

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=10.15.0

FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# VITE_API_BASE_URL is intentionally empty: the SPA hits relative /api and /ws
# paths so nginx (or Vercel rewrites) can same-origin proxy them.
ENV VITE_API_BASE_URL=""
RUN pnpm --filter @remitano/shared build && pnpm --filter web build

FROM nginx:alpine AS runtime
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
