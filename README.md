# Funny Movies — YouTube Share App

> Remitano fullstack take-home. A small web app for sharing YouTube videos with real-time
> notifications powered by WebSockets and a Redis-backed background-job queue.

[![CI](https://github.com/REPLACE-ME/remitano-homework/actions/workflows/ci.yml/badge.svg)](#)

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

> **Live URL:** _replace with the deployed Vercel URL after deploying_

---

## 2. Prerequisites

| Tool       | Version     | Why                                |
| ---------- | ----------- | ---------------------------------- |
| Node.js    | `>= 20.0`   | API + web                          |
| pnpm       | `>= 10.0`   | Workspace package manager          |
| Docker     | `>= 24.0`   | Postgres + Redis (recommended)     |
| PostgreSQL | `>= 14`     | Only if you don't use Docker       |
| Redis      | `>= 6`      | Only if you don't use Docker       |

```bash
node --version   # v20+
pnpm --version   # 10.x
docker --version # 24+
```

---

## 3. Installation & Configuration

```bash
# 1. Clone the repo
git clone <this-repo-url>
cd remitano-homework

# 2. Install dependencies (workspace install handles api, web, shared)
pnpm install

# 3. Configure env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### `apps/api/.env`

| Variable             | Default                                                              | Notes                                          |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `NODE_ENV`           | `development`                                                        | `production` in deploy                         |
| `PORT`               | `3001`                                                               |                                                |
| `LOG_LEVEL`          | `info`                                                               | `debug` for verbose, `silent` for tests        |
| `DATABASE_URL`       | `postgresql://postgres:postgres@localhost:5432/remitano?schema=public` |                                              |
| `REDIS_URL`          | `redis://localhost:6379`                                             |                                                |
| `JWT_ACCESS_SECRET`  | _(required, ≥ 16 chars)_                                             | Use `openssl rand -hex 32` to generate         |
| `JWT_ACCESS_TTL`     | `7d`                                                                 | Long enough to outlive a typical socket session |
| `CORS_ORIGIN`        | `http://localhost:5173`                                              | Comma-separated list                           |
| `THROTTLE_TTL`       | `60`                                                                 | Window in seconds                              |
| `THROTTLE_LIMIT`     | `120`                                                                | Requests per window per IP                     |

### `apps/web/.env`

| Variable           | Default                  | Notes                                                  |
| ------------------ | ------------------------ | ------------------------------------------------------ |
| `VITE_API_BASE_URL`| _(empty)_                | Empty in dev (uses Vite proxy) and on Vercel (rewrites)|
| `VITE_API_PROXY`   | `http://localhost:3001`  | Where the dev Vite server proxies `/api` and `/ws`     |

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

| Email              | Password      |
| ------------------ | ------------- |
| `alice@example.com`| `password123` |
| `bob@example.com`  | `password123` |

---

## 5. Running the Application

### Two-process dev (API + web concurrently)

```bash
pnpm dev
```

This runs:
- API on `http://localhost:3001` (Swagger at `/api/docs`, health at `/api/health`)
- Web on `http://localhost:5173` (Vite proxies `/api` and `/ws` to the API)

### Run the test suites

```bash
pnpm --filter api test         # API unit tests (Jest)
pnpm --filter api test:e2e     # API e2e (requires Postgres + Redis up; uses TEST_DATABASE_URL)
pnpm --filter web test         # Web tests (Vitest + RTL + real in-process Socket.IO server)
pnpm test                      # Everything in parallel via the workspace
```

The signature e2e test (`apps/api/test/share-notification.e2e-spec.ts`) registers two users,
opens a real Socket.IO connection for the second one, has the first share a video, and
asserts that `notification:new` arrives within 8 s with the expected title and sharer name.

### Useful one-liners

```bash
pnpm typecheck            # full repo typecheck
pnpm lint                 # ESLint over both apps
pnpm build                # production build of api + web + shared
pnpm demo                 # boots the entire stack via docker-compose (needs Docker daemon)
```

---

## 6. Docker Deployment

### Local end-to-end with Docker (the easy mode)

```bash
pnpm demo                 # equivalent to: docker-compose up --build
```

This brings up `postgres`, `redis`, `api` (which runs `prisma migrate deploy` + seeds + dev
server), and `web` (Vite dev server). When everything is up:

- Web: <http://localhost:5173>
- API: <http://localhost:3001>
- Swagger: <http://localhost:3001/api/docs>

The worker runs **inline** in the API process. The architecture supports extracting it into a
separate container by adding another service that runs the same image with a different
command — see §"Trade-offs" below.

### Production deployment (Vercel + Render)

The recommended topology for this take-home avoids cross-origin cookies entirely by serving
the API behind the Vercel domain via rewrites:

1. **Render** — create a Postgres add-on, a Redis add-on, and one Web Service for the API:
   - Build command: `pnpm install --frozen-lockfile=false && pnpm --filter api prisma generate && pnpm --filter api build`
   - Start command: `pnpm --filter api start:prod` (runs `prisma migrate deploy` then `node dist/main.js`)
   - Env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL=7d`,
     `CORS_ORIGIN=https://<your-vercel>.vercel.app`, `NODE_ENV=production`, `LOG_LEVEL=info`
2. **Vercel** — import the repo, set root to `apps/web`, build command
   `pnpm --filter web build`, output `apps/web/dist`. Update `apps/web/vercel.json` to point
   the rewrites at your Render URL:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://<your-render>.onrender.com/api/:path*" },
       { "source": "/ws/:path*",  "destination": "https://<your-render>.onrender.com/ws/:path*"  }
     ]
   }
   ```
3. After the first deploy, open the Render shell and run `pnpm --filter api prisma db seed`
   once to create the demo users.

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

| Symptom                                                            | Likely cause / fix |
| ------------------------------------------------------------------ | ------------------ |
| `ECONNREFUSED 5432`                                                | Postgres isn't running. `docker-compose up -d postgres` |
| `ECONNREFUSED 6379`                                                | Redis isn't running. `docker-compose up -d redis`       |
| API logs `Invalid environment variables`                           | Check `apps/api/.env` against §3 — `JWT_ACCESS_SECRET` must be ≥ 16 chars |
| Web shows "○ reconnecting" forever                                 | API isn't reachable. Check the Vite proxy / `VITE_API_PROXY` env var |
| Production: socket connects then immediately disconnects           | `CORS_ORIGIN` mismatch on the API; or you skipped the Vercel rewrite step |
| Production: first request after idle takes 30–60s                  | Render free-tier cold start. Expected; the SPA shows a loading state. |
| `oembed status=401`                                                | Some YouTube videos restrict embedding. We fall back to a generic title. |
| `prisma migrate deploy` errors                                     | Likely a schema drift; rerun `pnpm --filter api prisma migrate dev` locally to create a new migration |
| `409 VIDEO_ALREADY_SHARED`                                         | By design — the same `youtubeId` cannot be shared twice. Find it in the feed. |

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
│   ├── api/                 # NestJS 10 + Prisma + BullMQ + Socket.IO
│   │   ├── prisma/          # schema, migrations, seed
│   │   ├── src/
│   │   │   ├── modules/auth/
│   │   │   ├── modules/videos/
│   │   │   ├── modules/notifications/   # gateway + processor + service + controller
│   │   │   ├── modules/jobs/            # Redis + BullMQ Queue
│   │   │   ├── modules/health/
│   │   │   ├── common/                  # filters, pipes, decorators
│   │   │   └── config/                  # zod-validated env
│   │   └── test/                        # e2e (Supertest + socket.io-client)
│   └── web/                  # React 18 + Vite + Tailwind + TanStack Query
│       ├── src/
│       │   ├── app/
│       │   ├── features/auth/
│       │   ├── features/videos/
│       │   ├── features/notifications/  # SocketProvider, NotificationsPage
│       │   ├── lib/                     # axios client, query keys
│       │   ├── ui/                      # primitives (Button, Field, Layout)
│       │   └── test/                    # Vitest + RTL
│       └── vercel.json
├── packages/
│   └── shared/               # zod schemas + TS types + YouTube URL parser
├── docker-compose.yml        # postgres, redis, api, web
├── .github/workflows/ci.yml  # lint + typecheck + tests + build
└── README.md
```

## License

MIT (take-home submission).
