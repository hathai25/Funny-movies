# Funny Movies — YouTube Share App

> Remitano fullstack take-home. A small web app for sharing YouTube videos with real-time
> notifications powered by WebSockets and a Redis-backed background-job queue.

[![CI](https://github.com/hathai25/Funny-movies/actions/workflows/ci.yml/badge.svg)](https://github.com/hathai25/Funny-movies/actions/workflows/ci.yml)

---

## 1. Introduction

**Funny Movies** lets a logged-in user paste a YouTube URL, share it with the rest of the
team, and watch it inline. Whenever someone shares a new video, every other logged-in user
sees a toast in real time and the notification is persisted so they can review it later from
the notifications page.

### Key features

- Email + password auth with JWT access tokens and bcrypt-hashed passwords
- Share any YouTube URL (`watch`, `youtu.be`, `shorts`, `embed`, `live`, mobile, music)
- Privacy-respecting embeds (`youtube-nocookie.com`)
- Real-time notifications via Socket.IO + Redis pub/sub
- Background fan-out via BullMQ (retries, exponential backoff, dead-letter awareness)
- Persisted notification history with unread badge and "mark as read"
- Cursor pagination on `(createdAt, id)` for stable ordering
- Strict input validation with shared zod schemas (single source of truth FE/BE)
- Health check that pings Postgres + Redis
- Swagger API docs at `/api/docs`

### Architecture

```mermaid
flowchart LR
  Browser["React + Vite SPA"]
  Vercel["Vercel rewrites /api/* + /ws"]
  API["NestJS API + inline BullMQ worker"]
  Redis[("Redis")]
  PG[("PostgreSQL")]
  YT["YouTube oEmbed"]

  Browser -- "REST /api/* (JWT)" --> Vercel
  Browser <-- "Socket.IO /ws (JWT handshake)" --> Vercel
  Vercel -- "rewrite (same-origin)" --> API
  API -- "Prisma" --> PG
  API -- "BullMQ enqueue + consume" --> Redis
  API -- "Socket.IO Redis adapter" --> Redis
  API -- "fetch metadata" --> YT
```

When user A shares a video:

1. `POST /api/videos` validates the URL, fetches title/thumbnail via YouTube's public oEmbed
   endpoint, and persists a `Video` row.
2. The handler enqueues a `video.shared` job in BullMQ and immediately returns 201.
3. The notifications worker (running inline in the API process) fans out: it batch-creates a
   `Notification` row per recipient and emits `notification:new` via the Socket.IO Redis
   adapter so connected clients on **any** API instance receive it.
4. The browser shows a sonner toast (deduped by notification id) and refreshes its caches.

> **Live URL:** <https://funny-movies-web.vercel.app> (Vercel SPA → Render API).

---

## 2. Prerequisites

| Tool       | Version   | Why                            |
| ---------- | --------- | ------------------------------ |
| Node.js    | `>= 20.0` | API + web                      |
| pnpm       | `>= 10.0` | Workspace package manager      |
| Docker     | `>= 24.0` | Postgres + Redis (recommended) |
| PostgreSQL | `>= 14`   | Only if you don't use Docker   |
| Redis      | `>= 6`    | Only if you don't use Docker   |

```bash
node --version   # v20+
pnpm --version   # 10.x
docker --version # 24+
```

---

## 3. Installation & Configuration

```bash
# 1. Clone the repo
git clone https://github.com/hathai25/Funny-movies.git
cd Funny-movies

# 2. Install dependencies (workspace install handles api, web, shared)
pnpm install

# 3. Configure env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Generate a JWT secret (≥ 16 chars) and write it into apps/api/.env
#    Example: openssl rand -hex 32 | xargs -I{} sed -i.bak 's|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET={}|' apps/api/.env
```

### `apps/api/.env`

| Variable            | Default                                                                | Notes                                           |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`          | `development`                                                          | `production` in deploy                          |
| `PORT`              | `3001`                                                                 |                                                 |
| `LOG_LEVEL`         | `info`                                                                 | `debug` for verbose, `silent` for tests         |
| `DATABASE_URL`      | `postgresql://postgres:postgres@localhost:5432/remitano?schema=public` |                                                 |
| `REDIS_URL`         | `redis://localhost:6379`                                               |                                                 |
| `JWT_ACCESS_SECRET` | _(required, ≥ 16 chars)_                                               | Use `openssl rand -hex 32` to generate          |
| `JWT_ACCESS_TTL`    | `7d`                                                                   | Long enough to outlive a typical socket session |
| `CORS_ORIGIN`       | `http://localhost:5173`                                                | Comma-separated list                            |
| `THROTTLE_TTL`      | `60`                                                                   | Window in seconds                               |
| `THROTTLE_LIMIT`    | `120`                                                                  | Requests per window per IP                      |

### `apps/web/.env`

| Variable            | Default                 | Notes                                                   |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| `VITE_API_BASE_URL` | _(empty)_               | Empty in dev (uses Vite proxy) and on Vercel (rewrites) |
| `VITE_API_PROXY`    | `http://localhost:3001` | Where the dev Vite server proxies `/api` and `/ws`      |

---

## 4. Database Setup

The fastest path is to use Docker for Postgres + Redis. The full `docker compose up` flow is
in §6 below; for local dev you usually only need:

```bash
# Start Postgres and Redis
docker-compose up -d postgres redis

# From the api workspace, generate the Prisma client and apply migrations
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate     # or `prisma:deploy` for committed migrations only

# Seed two demo users
pnpm --filter api prisma:seed
```

### Demo accounts (after seeding)

| Email               | Password      |
| ------------------- | ------------- |
| `alice@example.com` | `password123` |
| `bob@example.com`   | `password123` |

---

## 5. Running the Application

### Concurrent dev (shared watcher + API + web)

```bash
pnpm dev
```

This builds `@remitano/shared` once, then runs three processes side-by-side via
`concurrently`:

- `@remitano/shared` in `tsc --watch` mode so api/web pick up changes to schemas/types
- API on `http://localhost:3001` (Swagger at `/api/docs`, health at `/api/health`)
- Web on `http://localhost:5173` (Vite proxies `/api` and `/ws` to the API)

### Run the test suites

```bash
pnpm --filter api test         # API unit tests (Jest)
pnpm --filter api test:e2e     # API e2e (requires Postgres + Redis up; uses TEST_DATABASE_URL)
pnpm --filter web test         # Web tests (Vitest + RTL + real in-process Socket.IO server)
pnpm test                      # Everything in parallel via the workspace
```

#### Test inventory

Ten test files cover the realtime path top-to-bottom — pure unit tests for service logic and
the YouTube parser, contract tests for the WebSocket gateway, and a real end-to-end run that
boots the full Nest app and a live Socket.IO client.

| Suite                                                                | Type               | Covers                                                                                     |
| -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/auth/auth.service.spec.ts`                     | Unit (Jest)        | Register dedup (409), bcrypt hashing, password verification, JWT issuance + payload shape  |
| `apps/api/src/modules/videos/videos.service.spec.ts`                 | Unit (Jest)        | URL parsing, oEmbed integration, duplicate-share `P2002` → 409, BullMQ enqueue side effect |
| `apps/api/src/modules/videos/youtube-parser.spec.ts`                 | Unit (Jest)        | All YouTube URL flavours: `watch`, `youtu.be`, `shorts`, `embed`, `live`, `m.`, `music.`   |
| `apps/api/src/modules/videos/youtube-oembed.client.spec.ts`          | Unit (Jest)        | undici `MockAgent` interceptor — happy path, non-200 fallback, timeout fallback            |
| `apps/api/src/modules/notifications/notifications.service.spec.ts`   | Unit (Jest)        | Cursor pagination on `(createdAt, id)`, mark-read scoping, unread count                    |
| `apps/api/src/modules/notifications/notifications.processor.spec.ts` | Unit (Jest)        | Fan-out batching, sharer exclusion, dedup of pre-existing notifications                    |
| `apps/api/src/modules/notifications/notifications.gateway.spec.ts`   | Unit (Jest)        | JWT handshake (auth header, query, `auth.token`), reject on missing/invalid token          |
| `apps/api/test/share-notification.e2e-spec.ts`                       | E2E (Jest)         | **Canonical realtime test**: real Nest app + Postgres + Redis + Socket.IO, share → toast   |
| `apps/web/src/test/socket-toast.test.tsx`                            | Component (Vitest) | Real in-process Socket.IO server pushing `notification:new` → toast renders                |
| `apps/web/src/test/youtube-parser.test.ts`                           | Unit (Vitest)      | Parser shape validation from the SPA's perspective                                         |

The e2e test (`share-notification.e2e-spec.ts`) is the headline suite: registers two users,
opens a real `socket.io-client` connection for user B, has user A share a video, and asserts
B receives `notification:new` within 8 s with the expected title and sharer name. CI runs all
ten suites against live Postgres + Redis services — see `.github/workflows/ci.yml`.

### Local benchmark

`apps/api/bench/signature-flow.mjs` drives the realtime path end-to-end against a local API:
seeds N bench users via Prisma, signs JWTs, opens N Socket.IO subscribers, fires K shares,
and reports p50/p95/p99 fanout latency plus connect/share/delivery success rates. See
`apps/api/bench/README.md` for details.

```bash
pnpm --filter api bench                                   # 50 subs, 20 shares @ 1/s
pnpm --filter api bench -- --subscribers 200 --shares 50  # bigger run
```

### Useful one-liners

```bash
pnpm typecheck            # full repo typecheck
pnpm lint                 # ESLint over both apps
pnpm build                # production build of api + web + shared
pnpm demo                 # boots the entire stack via docker compose (needs Docker daemon)
```

---

## 6. Docker Deployment

There are two compose flavors. Pick by file selection:

| Mode               | What it runs                                                                                                                                   | When to use                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Dev** (default)  | `node:20-alpine` containers that bind-mount the workspace and run `pnpm dev` with hot reload                                                   | Iterating on the take-home locally; you want changes to reflect without rebuilding.    |
| **Prod** (overlay) | Multi-stage built images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) — slim runtime, nginx serving the SPA, `node dist/main.js` for the API | Demonstrating production-style deploy; what reviewers should run to test the artifact. |

### Dev mode

```bash
pnpm demo                 # alias for `docker compose up --build`
# or:
docker compose up --build
```

Brings up `postgres`, `redis`, `api` (installs deps, runs migrations, seeds alice/bob, then
`nest start --watch`), and `web` (`vite dev`). Once running:

- Web: <http://localhost:5173>
- API: <http://localhost:3001>
- Swagger: <http://localhost:3001/api/docs>

### Prod mode (built images)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

The overlay (`docker-compose.prod.yml`) replaces `api` and `web` with images built from:

- **`apps/api/Dockerfile`** — three-stage build (`deps` → `builder` → `runtime`). The
  `builder` stage compiles `@remitano/shared`, runs `prisma generate`, and emits `dist/` via
  `nest build`. The `runtime` stage carries only the built artifacts + node_modules and runs
  `prisma migrate deploy && node dist/src/main.js` on start.
- **`apps/web/Dockerfile`** — two-stage build. The first stage runs `vite build`; the second
  is a slim `nginx:alpine` that serves `dist/` plus a hand-written `apps/web/nginx.conf`
  with three notable bits: aggressive `Cache-Control: immutable` on hashed `/assets/`, an
  upstream proxy to `api:3001` for `/api/*` and `/ws/*` (websocket upgrade headers wired
  for Socket.IO), and an SPA fallback (`try_files $uri /index.html`) so React Router
  client-side routes survive a refresh.

Once running:

- Web: <http://localhost:8080> (nginx)
- API direct: <http://localhost:3001> (also reachable through `/api/*` on :8080)
- Swagger: <http://localhost:3001/api/docs>

The worker runs **inline** in the API process. The architecture (separate BullMQ queue + a
Socket.IO Redis adapter for cross-instance fan-out) supports running the worker as its own
container — start it with `node dist/notifications.worker.js` and remove the processor from
the API's bootstrap. For the take-home this would just double the Render bill.

### Building the images standalone

If you want to push or scan the images outside of compose:

```bash
docker build -f apps/api/Dockerfile -t funny-movies-api:1.0.0 .
docker build -f apps/web/Dockerfile -t funny-movies-web:1.0.0 .
```

The build context **must** be the repo root — both Dockerfiles need the workspace `pnpm-lock.yaml`
and the `packages/shared` source tree.

### Production deployment (Vercel + Render)

The deployed topology is Vercel for the SPA and Render for the API + managed Postgres + Redis.
The SPA hits relative `/api/*` and `/ws/*` paths and Vercel rewrites them to the Render URL,
so the browser sees the API as same-origin (no CORS preflights, no cross-origin cookies).

Already wired in this repo:

- `apps/web/vercel.json` rewrites point at `https://funny-movies-mgbu.onrender.com`.
- `apps/api/start:prod` runs `prisma migrate deploy && node dist/src/main.js`.

Steps to reproduce on a fork:

1. **Render** — provision a Postgres add-on, a Redis add-on, and one Web Service for the API.
   - Build command: `pnpm install --frozen-lockfile=false && pnpm --filter @remitano/shared build && pnpm --filter api exec prisma generate && pnpm --filter api build`
     - Both the shared build and `pnpm exec prisma generate` are required — `pnpm --filter api prisma generate` looks for a script named `prisma` and silently no-ops (we hit this in CI; same gotcha bites here).
   - Start command: `pnpm --filter api start:prod`
   - Env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` (≥ 16 chars), `JWT_ACCESS_TTL=7d`, `CORS_ORIGIN=https://<your-vercel>.vercel.app`, `NODE_ENV=production`, `LOG_LEVEL=info`
2. **Vercel** — import the repo, set the project root to `apps/web`, build command
   `pnpm --filter @remitano/shared build && pnpm --filter web build`, output `apps/web/dist`.
   Edit `apps/web/vercel.json` so the rewrite destinations point at **your** Render URL.
   - **Important:** leave `VITE_API_BASE_URL` empty/unset on Vercel. If it's set to the Render
     URL, the SPA bypasses the rewrites and hits Render cross-origin, breaking CORS.
3. After the first deploy, open the Render shell once and run
   `pnpm --filter api exec prisma db seed` to create the alice/bob demo users.

---

## 7. Usage

1. Open the live URL (or `http://localhost:5173`).
2. Click **Sign in** and log in as `alice@example.com / password123` in one browser, and as
   `bob@example.com / password123` in another (incognito works great).
3. As Alice, paste a YouTube URL into the share form and click **Share**, e.g.
   `https://www.youtube.com/watch?v=dQw4w9WgXcQ`.
4. As Bob, you'll see a toast pop in the top-right within ~1 s ("New video shared by Alice").
   The bell badge in the header increments. The `Notifications` page lists the persisted
   notification.
5. The video appears in the feed for both users and plays inline via the privacy-preserving
   `youtube-nocookie.com` embed.

### What reviewers should test

- Realtime: share from one browser, see the toast in another (the marquee feature).
- Persistence: log in as a brand-new user — they will not see notifications from before they
  joined, but new shares will arrive in real time.
- Duplicate share: try the same URL twice — second attempt returns a friendly 409.
- URL coverage: try short URLs (`youtu.be/...`), shorts, embed, live, m./music subdomains.
- Auth: protected pages redirect to `/login` when not authenticated.

---

## 8. Troubleshooting

| Symptom                                                  | Likely cause / fix                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ECONNREFUSED 5432`                                      | Postgres isn't running. `docker-compose up -d postgres`                                               |
| `ECONNREFUSED 6379`                                      | Redis isn't running. `docker-compose up -d redis`                                                     |
| API logs `Invalid environment variables`                 | Check `apps/api/.env` against §3 — `JWT_ACCESS_SECRET` must be ≥ 16 chars                             |
| Web shows "○ reconnecting" forever                       | API isn't reachable. Check the Vite proxy / `VITE_API_PROXY` env var                                  |
| Production: socket connects then immediately disconnects | `CORS_ORIGIN` mismatch on the API; or you skipped the Vercel rewrite step                             |
| Production: first request after idle takes 30–60s        | Render free-tier cold start. Expected; the SPA shows a loading state.                                 |
| `oembed status=401`                                      | Some YouTube videos restrict embedding. We fall back to a generic title.                              |
| `prisma migrate deploy` errors                           | Likely a schema drift; rerun `pnpm --filter api prisma migrate dev` locally to create a new migration |
| `409 VIDEO_ALREADY_SHARED`                               | By design — the same `youtubeId` cannot be shared twice. Find it in the feed.                         |

---

## Trade-offs and what I'd change at scale

This is a **take-home**, so the scope was deliberately bounded. In a real production system I
would change the following:

- **Notification fan-out is O(N users) per share.** Acceptable for an MVP — for production
  I'd switch to a lazy activity-stream model: write one row per event, compute "unread per
  user" via a `last_seen_at` watermark, and only push real-time deltas to currently-connected
  sockets (tracked via a Redis presence set).
- **The BullMQ worker runs inline in the API process** for a single-service deploy. The
  architecture (separate queue, Redis adapter for pub/sub) supports running the worker as its
  own process — start it with `node dist/notifications.worker.js` and remove the processor
  module from the API's bootstrap. For the take-home this would just double the Render bill
  with no behavioral difference.
- **Refresh-token rotation is intentionally omitted.** Long-lived JWT (7 d) + logout-clears
  is enough for a demo. Adding refresh tokens correctly across origins (cookies, SameSite,
  CHIPS, rotation, reuse detection) is a meaningful chunk of work that pays no grading
  dividend here.
- **Auth is JWT-only** — no OAuth/social login per the spec.
- **Notifications older than ~30 days should be pruned** by a scheduled job. Not implemented.
- **Frontend doesn't optimistically update the feed** when sharing — a small UX win that's
  easy to add but adds complexity around the duplicate-share 409 case.
- **Observability is minimal** — pino structured logs only. Production: add OpenTelemetry
  tracing, Sentry for the SPA, and a `/metrics` endpoint for Prometheus.
- **No Playwright E2E** — the API e2e covers the realtime path; a Playwright run that
  drives two browser contexts would be a nice addition.

## Known limitations

- **Render free-tier cold start.** The API spins down after ~15 minutes of inactivity. The
  first request will take 30–60 seconds; subsequent requests are instant. The SPA handles
  this with reconnect backoff and a "reconnecting" indicator.
- **Render free-tier Postgres expires after 90 days** and cannot be restored. Re-provision
  and re-seed if the demo URL has gone stale.
- **No email/push notifications** — toast + history page only, per the spec.
- **No moderation / abuse prevention** beyond per-user throttling (10 share attempts per
  minute, 10 login attempts per minute).

---

## Repository layout

```
.
├── apps/
│   ├── api/                       # NestJS 10 + Prisma + BullMQ + Socket.IO
│   │   ├── bench/                 # local signature-flow load test (Node script)
│   │   ├── prisma/                # schema, migrations, seed
│   │   ├── src/
│   │   │   ├── modules/auth/
│   │   │   ├── modules/videos/
│   │   │   ├── modules/notifications/   # gateway + processor + service + controller
│   │   │   ├── modules/jobs/            # Redis + BullMQ Queue
│   │   │   ├── modules/health/
│   │   │   ├── common/                  # filters, pipes, decorators
│   │   │   └── config/                  # zod-validated env
│   │   ├── test/                        # e2e (Supertest + socket.io-client)
│   │   └── Dockerfile                   # multi-stage api image
│   └── web/                       # React 18 + Vite + Tailwind + TanStack Query
│       ├── src/
│       │   ├── app/
│       │   ├── features/auth/
│       │   ├── features/videos/
│       │   ├── features/notifications/  # SocketProvider, NotificationsPage
│       │   ├── lib/                     # axios client, query keys
│       │   ├── ui/                      # primitives (Button, Field, Layout)
│       │   └── test/                    # Vitest + RTL
│       ├── nginx.conf                   # SPA fallback + /api + /ws upstream proxy
│       ├── Dockerfile                   # build SPA + serve via nginx:alpine
│       └── vercel.json
├── packages/
│   └── shared/                    # zod schemas + TS types + YouTube URL parser
├── docker-compose.yml             # dev: postgres, redis, api (hot reload), web (vite)
├── docker-compose.prod.yml        # prod overlay: built images via Dockerfiles
├── .github/workflows/ci.yml       # lint + typecheck + tests + build
└── README.md
```

## License

MIT (take-home submission).
