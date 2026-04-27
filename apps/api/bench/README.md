# Signature flow benchmark

Local-only load test for the realtime path: **A POSTs `/api/videos` → B..Z receive `notification:new` over WS within X ms**.

## What it measures

- HTTP share latency (p50/p95/p99) — how fast `POST /api/videos` returns
- End-to-end fanout latency (p50/p95/p99/max) — share request sent → each subscriber receives the WS event
- Connect success, share success, delivery success rates

## Run

```bash
# 1. Bring up the local stack (in another terminal)
docker-compose up -d postgres redis
pnpm --filter api dev

# 2. Run the bench
pnpm --filter api bench

# Or with custom params:
pnpm --filter api bench -- --subscribers 200 --shares 50 --rate 1
```

Flags:

| flag            | default                 | meaning                                                          |
| --------------- | ----------------------- | ---------------------------------------------------------------- |
| `--api`         | `http://localhost:3001` | API base URL                                                     |
| `--subscribers` | `50`                    | Concurrent WS clients (each = a unique bench user)               |
| `--shares`      | `20`                    | Number of `POST /api/videos` requests to fire                    |
| `--rate`        | `1`                     | Shares per second                                                |
| `--grace`       | `5`                     | Seconds to wait after the last share for in-flight notifications |

## How it works

1. **Seeds users via Prisma** (`bench-{run}-{i}@local.bench`) — direct DB inserts. Hitting `/api/auth/register` would be capped at 10/min by the route throttler.
2. **Signs JWTs locally** with the `JWT_ACCESS_SECRET` from `apps/api/.env`, matching the payload shape (`sub/email/name`) that `AuthService` issues.
3. **Opens N Socket.IO subscribers** against `/ws`, each authenticated with its user's JWT (handshake `auth.token`).
4. **Fires K shares** as the (N+1)-th user. Each share uses a random 11-char YouTube ID. The real YouTube oEmbed call inside `VideosService.share` will fail for these fake IDs, but `YoutubeOembedClient.fetch` falls back to a stub title — the share still succeeds.
5. **Records timestamps**: `sentAt` per share (after `POST` resolves), `recvAt` per recipient (matched to the share by `youtubeId` in the WS payload).
6. **Reports** percentiles after a grace period so late-arriving messages are counted.

Bench-tagged data (everything starting with `bench-`) is wiped at the start of each run. Demo seed users (alice/bob) are untouched.

## Caveats

### Throttler caps share rate

`POST /api/videos` is decorated with `@Throttle({ default: { ttl: 60_000, limit: 10 } })` in `apps/api/src/modules/videos/videos.controller.ts`. From a single IP the bench will hit 429 after 10 requests/min. To stress-test higher rates, raise or remove that decorator locally — the bench prints a hint when it sees 429s.

`/api/auth/register` and `/api/auth/login` carry the same per-route throttle but the bench bypasses them by seeding directly via Prisma, so you only need to relax the videos throttle.

### Fake YouTube IDs trigger oEmbed fallback

The bench generates random 11-char IDs that pass `parseYouTubeId` shape validation but don't resolve to real videos. `YoutubeOembedClient` returns a stub on non-200/timeout, so the share path still succeeds with `title = "YouTube video {id}"`. If you want realistic oEmbed timings, swap `randomYouTubeId()` for a small pool of real IDs and clear the unique constraint between runs.

### In-process vs over-the-wire

The bench talks to the API over HTTP+WS on localhost. That includes the real Express stack, NestJS pipes/guards, BullMQ enqueue, Postgres write, BullMQ worker, and the Socket.IO Redis adapter — i.e., everything except the network hop. For a same-process test (no HTTP overhead), see `apps/api/test/share-notification.e2e-spec.ts`.

### What the numbers mean

- **HTTP share p99 ≈ Postgres write + oEmbed timeout + BullMQ enqueue.** Should be < 200ms with a warm cache and dropped/stubbed oEmbed.
- **Fanout p99 ≈ HTTP share + BullMQ pickup + Postgres `createMany` for notifications + Redis pub/sub + Socket.IO emit.** Expect 50–300ms on a healthy local stack with 50–200 subscribers; degradation as subscriber count grows points at the WS server or Redis adapter.
