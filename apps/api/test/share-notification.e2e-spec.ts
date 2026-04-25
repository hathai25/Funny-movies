import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import nock from 'nock';
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

  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DB_URL;
    process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    process.env['JWT_ACCESS_SECRET'] = 'test-secret-test-secret-test-secret';
    process.env['JWT_ACCESS_TTL'] = '1h';
    process.env['NODE_ENV'] = 'test';

    nock.disableNetConnect();
    nock.enableNetConnect((host) => host.includes('127.0.0.1') || host.includes('localhost'));
    nock('https://www.youtube.com')
      .persist()
      .get('/oembed')
      .query(true)
      .reply(200, {
        title: 'Never Gonna Give You Up',
        author_name: 'Rick Astley',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      });

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
    nock.cleanAll();
    nock.enableNetConnect();
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
});
