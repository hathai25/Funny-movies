import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { AddressInfo } from 'node:net';

const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/remitano_test?schema=public';

describe('share -> notification e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DB_URL;
    process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    process.env['JWT_ACCESS_SECRET'] = 'test-secret-test-secret-test-secret';
    process.env['JWT_ACCESS_TTL'] = '1h';
    process.env['NODE_ENV'] = 'test';

    // Intercept undici (used by YoutubeOembedClient) — nock doesn't catch it.
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent.enableNetConnect(/(127\.0\.0\.1|localhost)/);
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .reply(
        200,
        JSON.stringify({
          title: 'Never Gonna Give You Up',
          author_name: 'Rick Astley',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }),
        { headers: { 'content-type': 'application/json' } },
      )
      .persist();
    setGlobalDispatcher(mockAgent);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);
    await prisma.notification.deleteMany();
    await prisma.video.deleteMany();
    await prisma.user.deleteMany();

    const server = app.getHttpServer();
    const addr = server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
    await app?.close();
  });

  it('user A shares -> user B receives notification:new', async () => {
    const userA = await request(url)
      .post('/api/auth/register')
      .send({ email: 'a@test.com', password: 'password123', name: 'Alice' })
      .expect(201);

    const userB = await request(url)
      .post('/api/auth/register')
      .send({ email: 'b@test.com', password: 'password123', name: 'Bob' })
      .expect(201);

    const tokenB = userB.body.accessToken as string;
    const tokenA = userA.body.accessToken as string;

    const socketB: Socket = ioClient(`${url}/ws`, {
      path: '/ws/socket.io',
      transports: ['websocket'],
      auth: { token: tokenB },
      reconnection: false,
    });

    const received = new Promise<{ title: string; sharerName: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for notification')), 8000);
      socketB.on('notification:new', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
      socketB.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    await new Promise<void>((resolve) => socketB.on('connect', () => resolve()));

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      .expect(201);

    const event = await received;
    expect(event.title).toBe('Never Gonna Give You Up');
    expect(event.sharerName).toBe('Alice');

    socketB.disconnect();
  }, 30_000);

  it('rejects unauthenticated share', async () => {
    await request(url)
      .post('/api/videos')
      .send({ url: 'https://youtu.be/abcdefghijk' })
      .expect(401);
  });

  it('rejects invalid YouTube URL', async () => {
    const reg = await request(url)
      .post('/api/auth/register')
      .send({ email: 'c@test.com', password: 'password123', name: 'Cara' })
      .expect(201);

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ url: 'https://example.com/not-youtube' })
      .expect(422);
  });

  it('returns 409 on duplicate share without enqueuing again', async () => {
    const reg = await request(url)
      .post('/api/auth/register')
      .send({ email: 'd@test.com', password: 'password123', name: 'Dan' })
      .expect(201);

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ url: 'https://youtu.be/AAAAAAAAAAA' })
      .expect(201);

    const res = await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' })
      .expect(409);

    expect(res.body.code).toBe('VIDEO_ALREADY_SHARED');
  });

  it('rejects login with wrong password', async () => {
    await request(url)
      .post('/api/auth/register')
      .send({ email: 'login-wrong@test.com', password: 'password123', name: 'Eve' })
      .expect(201);

    await request(url)
      .post('/api/auth/login')
      .send({ email: 'login-wrong@test.com', password: 'not-the-password' })
      .expect(401);

    const ok = await request(url)
      .post('/api/auth/login')
      .send({ email: 'login-wrong@test.com', password: 'password123' })
      .expect(200);

    expect(typeof ok.body.accessToken).toBe('string');
    expect(ok.body.user.email).toBe('login-wrong@test.com');
  });

  it('GET /api/videos returns shared videos in reverse-chronological order', async () => {
    const reg = await request(url)
      .post('/api/auth/register')
      .send({ email: 'list@test.com', password: 'password123', name: 'Liz' })
      .expect(201);

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ url: 'https://youtu.be/BBBBBBBBBBB' })
      .expect(201);
    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ url: 'https://youtu.be/CCCCCCCCCCC' })
      .expect(201);

    const res = await request(url)
      .get('/api/videos?limit=10')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .expect(200);

    const ids = res.body.items.map((v: { youtubeId: string }) => v.youtubeId);
    // CCC was shared after BBB → must come first
    expect(ids.indexOf('CCCCCCCCCCC')).toBeLessThan(ids.indexOf('BBBBBBBBBBB'));
  });

  it('notifications list + mark-as-read flow', async () => {
    // Two fresh users — sharer and recipient.
    const sharer = await request(url)
      .post('/api/auth/register')
      .send({ email: 'sharer@test.com', password: 'password123', name: 'Sharer' })
      .expect(201);
    const recipient = await request(url)
      .post('/api/auth/register')
      .send({ email: 'recipient@test.com', password: 'password123', name: 'Recipient' })
      .expect(201);
    const tokenS = sharer.body.accessToken as string;
    const tokenR = recipient.body.accessToken as string;

    // Recipient's inbox starts empty (or unaffected by other tests' leftovers).
    const before = await request(url)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenR}`)
      .expect(200);
    const baseUnread = before.body.unreadCount as number;

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${tokenS}`)
      .send({ url: 'https://youtu.be/DDDDDDDDDDD' })
      .expect(201);

    // Wait briefly for the BullMQ worker (inline) to fan out.
    let listed:
      | {
          items: Array<{ id: string; readAt: string | null; videoId: string }>;
          unreadCount: number;
        }
      | undefined;
    for (let i = 0; i < 20; i++) {
      const res = await request(url)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenR}`)
        .expect(200);
      if (res.body.unreadCount > baseUnread) {
        listed = res.body;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    expect(listed).toBeDefined();
    expect(listed!.unreadCount).toBe(baseUnread + 1);
    const newest = listed!.items[0]!;
    expect(newest.readAt).toBeNull();

    const marked = await request(url)
      .post('/api/notifications/read')
      .set('Authorization', `Bearer ${tokenR}`)
      .send({ ids: [newest.id] })
      .expect(201);
    expect(marked.body.updated).toBe(1);

    const after = await request(url)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenR}`)
      .expect(200);
    expect(after.body.unreadCount).toBe(baseUnread);
    const fetched = after.body.items.find((n: { id: string }) => n.id === newest.id);
    expect(fetched.readAt).not.toBeNull();
  }, 30_000);

  it('sharer does not receive a notification for their own share', async () => {
    const sharer = await request(url)
      .post('/api/auth/register')
      .send({ email: 'self@test.com', password: 'password123', name: 'Self' })
      .expect(201);
    const tokenS = sharer.body.accessToken as string;

    const before = await request(url)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenS}`)
      .expect(200);
    const baseCount = before.body.items.length as number;

    await request(url)
      .post('/api/videos')
      .set('Authorization', `Bearer ${tokenS}`)
      .send({ url: 'https://youtu.be/EEEEEEEEEEE' })
      .expect(201);

    // Give the worker time to (not) deliver — we're asserting no growth.
    await new Promise((r) => setTimeout(r, 1500));

    const after = await request(url)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenS}`)
      .expect(200);
    expect(after.body.items.length).toBe(baseCount);
  }, 15_000);

  it('rejects notifications endpoints without a token', async () => {
    await request(url).get('/api/notifications').expect(401);
    await request(url).post('/api/notifications/read').send({ ids: [] }).expect(401);
  });
});
