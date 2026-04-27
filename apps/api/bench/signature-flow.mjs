// Local benchmark for the signature flow:
//   user A POSTs /api/videos -> user B..Z receive `notification:new` over WS.
//
// Measures end-to-end fanout latency (share request sent -> subscriber receives).
// See ./README.md for usage and caveats.

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { request as undiciRequest } from 'undici';

const { values } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:3001' },
    subscribers: { type: 'string', default: '50' },
    shares: { type: 'string', default: '20' },
    rate: { type: 'string', default: '1' }, // shares per second
    grace: { type: 'string', default: '5' }, // seconds to wait for in-flight events after the last share
  },
});

const apiUrl = values.api.replace(/\/$/, '');
const wsUrl = `${apiUrl}/ws`;
const N = Number(values.subscribers);
const K = Number(values.shares);
const ratePerSec = Number(values.rate);
const graceMs = Number(values.grace) * 1000;

if (!Number.isFinite(N) || N < 1) throw new Error('--subscribers must be >= 1');
if (!Number.isFinite(K) || K < 1) throw new Error('--shares must be >= 1');
if (!Number.isFinite(ratePerSec) || ratePerSec <= 0) throw new Error('--rate must be > 0');

loadDotEnv(path.resolve(scriptDir(), '..', '.env'));

const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_TTL = process.env.JWT_ACCESS_TTL ?? '1h';
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('JWT_ACCESS_SECRET must be set in apps/api/.env (>= 16 chars)');
}

const prisma = new PrismaClient();
const runId = randomBytes(4).toString('hex');
const benchEmailPrefix = `bench-${runId}-`;

console.log(`[bench] api=${apiUrl} subscribers=${N} shares=${K} rate=${ratePerSec}/s run=${runId}`);

await main().catch((err) => {
  console.error('[bench] fatal:', err);
  process.exitCode = 1;
});

await prisma.$disconnect();

async function main() {
  console.log('[bench] seeding users...');
  const users = await seedUsers(N + 1); // last user is the sharer
  const subscribers = users.slice(0, N);
  const sharer = users[N];
  console.log(`[bench] seeded ${users.length} users (${subscribers.length} subs + 1 sharer)`);

  console.log('[bench] connecting subscribers...');
  const fanout = new Map(); // shareIdx -> Map<userId, ts>
  const sockets = await connectSubscribers(subscribers, fanout);
  const connected = sockets.filter(Boolean).length;
  console.log(`[bench] connected ${connected}/${N} subscribers`);
  if (connected === 0) throw new Error('no subscribers connected; aborting');

  console.log(`[bench] firing ${K} shares at ${ratePerSec}/s...`);
  const shareResults = await fireShares(sharer, K, ratePerSec, fanout);

  console.log(`[bench] waiting ${graceMs / 1000}s for in-flight notifications...`);
  await sleep(graceMs);

  for (const s of sockets) s?.close();

  report(shareResults, fanout, connected);
}

async function seedUsers(count) {
  // Wipe any prior bench-tagged data first to keep the run isolated.
  // We can't truncate everything because the user may have demo data they care about.
  await prisma.notification.deleteMany({
    where: { user: { email: { startsWith: 'bench-' } } },
  });
  await prisma.video.deleteMany({
    where: { sharedBy: { email: { startsWith: 'bench-' } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'bench-' } } });

  const passwordHash = await bcrypt.hash('bench-password', 4); // low cost; just for shape
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      email: `${benchEmailPrefix}${i}@local.bench`,
      name: `Bench ${i}`,
      passwordHash,
    });
  }
  await prisma.user.createMany({ data: rows });
  const created = await prisma.user.findMany({
    where: { email: { startsWith: benchEmailPrefix } },
    orderBy: { createdAt: 'asc' },
  });
  return created.map((u) => ({
    ...u,
    token: jwt.sign({ sub: u.id, email: u.email, name: u.name }, JWT_SECRET, {
      expiresIn: JWT_TTL,
    }),
  }));
}

async function connectSubscribers(subscribers, fanout) {
  const sockets = await Promise.all(
    subscribers.map(
      (user) =>
        new Promise((resolve) => {
          const socket = ioClient(wsUrl, {
            auth: { token: user.token },
            transports: ['websocket'],
            reconnection: false,
            timeout: 10_000,
          });
          let settled = false;
          const settle = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          socket.on('connect', () => settle(socket));
          socket.on('connect_error', (e) => {
            console.warn(`[bench] socket connect_error user=${user.id}: ${e.message}`);
            socket.close();
            settle(null);
          });
          socket.on('notification:new', (event) => {
            const t = performance.now();
            const idx = event?.payload?.youtubeId
              ? shareIndexByYoutubeId.get(event.payload.youtubeId)
              : undefined;
            if (idx === undefined) return;
            let bucket = fanout.get(idx);
            if (!bucket) {
              bucket = new Map();
              fanout.set(idx, bucket);
            }
            bucket.set(user.id, t);
          });
        }),
    ),
  );
  return sockets;
}

const shareIndexByYoutubeId = new Map();

async function fireShares(sharer, K, ratePerSec, _fanout) {
  const intervalMs = 1000 / ratePerSec;
  const results = []; // { idx, sentAt, ok, status, ms }
  for (let i = 0; i < K; i++) {
    const youtubeId = randomYouTubeId();
    shareIndexByYoutubeId.set(youtubeId, i);
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;
    const t0 = performance.now();
    let status = 0;
    let ok = false;
    try {
      const res = await undiciRequest(`${apiUrl}/api/videos`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sharer.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      status = res.statusCode;
      ok = status >= 200 && status < 300;
      // drain body so the connection can be reused
      await res.body.dump();
    } catch (e) {
      console.warn(`[bench] share ${i} threw: ${e.message}`);
    }
    const sentAt = performance.now();
    results.push({ idx: i, sentAt, ok, status, ms: sentAt - t0 });
    if (!ok) {
      console.warn(`[bench] share ${i} failed status=${status}`);
    }
    const elapsed = performance.now() - t0;
    const wait = intervalMs - elapsed;
    if (wait > 0) await sleep(wait);
  }
  return results;
}

function report(shareResults, fanout, subsConnected) {
  const successfulShares = shareResults.filter((r) => r.ok);
  const latencies = []; // per-recipient latencies in ms
  let recipientsTotal = 0;
  for (const r of successfulShares) {
    const bucket = fanout.get(r.idx);
    if (!bucket) continue;
    for (const t of bucket.values()) {
      latencies.push(t - r.sentAt);
      recipientsTotal++;
    }
  }
  latencies.sort((a, b) => a - b);

  const expectedDeliveries = successfulShares.length * subsConnected;
  const httpLatencies = shareResults.map((r) => r.ms).sort((a, b) => a - b);

  const fmt = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}ms` : 'n/a');
  console.log('');
  console.log('=== Signature flow benchmark ===');
  console.log(`Subscribers connected:   ${subsConnected}`);
  console.log(
    `Shares ok / total:       ${successfulShares.length} / ${shareResults.length}` +
      ` (${shareResults.length === 0 ? 0 : ((successfulShares.length / shareResults.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Notifications received:  ${recipientsTotal} / expected ${expectedDeliveries}` +
      ` (${expectedDeliveries === 0 ? 0 : ((recipientsTotal / expectedDeliveries) * 100).toFixed(1)}%)`,
  );
  console.log('');
  console.log('-- HTTP share latency (ms) --');
  console.log(`p50: ${fmt(percentile(httpLatencies, 50))}`);
  console.log(`p95: ${fmt(percentile(httpLatencies, 95))}`);
  console.log(`p99: ${fmt(percentile(httpLatencies, 99))}`);
  console.log('');
  console.log('-- End-to-end fanout latency (ms) --');
  console.log('share POST -> subscriber receives notification:new');
  console.log(`p50: ${fmt(percentile(latencies, 50))}`);
  console.log(`p95: ${fmt(percentile(latencies, 95))}`);
  console.log(`p99: ${fmt(percentile(latencies, 99))}`);
  console.log(`max: ${fmt(latencies[latencies.length - 1])}`);

  const statuses = new Map();
  for (const r of shareResults) {
    if (r.ok) continue;
    statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
  }
  if (statuses.size > 0) {
    console.log('');
    console.log('-- Failed share status codes --');
    for (const [code, count] of statuses.entries()) {
      console.log(`${code || 'network'}: ${count}`);
    }
    if (statuses.has(429)) {
      console.log(
        '\nHint: 429s come from the per-route @Throttle (10/min) on POST /api/videos.\n' +
          '      Bump or remove that decorator in apps/api/src/modules/videos/videos.controller.ts\n' +
          '      to test higher share rates.',
      );
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomYouTubeId() {
  // 11 chars from [A-Za-z0-9_-] — matches youtube-id shape so server-side parser accepts it.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = randomBytes(11);
  let out = '';
  for (let i = 0; i < 11; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function loadDotEnv(p) {
  try {
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key] !== undefined) continue;
      const val = rawVal.replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  } catch {
    // .env optional
  }
}

function scriptDir() {
  return path.dirname(fileURLToPath(import.meta.url));
}

// hush unused warning in older node
void randomUUID;
