import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { VideosService } from './videos.service';
import type { YoutubeOembedClient } from './youtube-oembed.client';
import type { JobsService } from '../jobs/jobs.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('VideosService', () => {
  const mkVideo = (overrides: Record<string, unknown> = {}) => ({
    id: 'v1',
    youtubeId: 'dQw4w9WgXcQ',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    author: 'Rick',
    thumbnailUrl: null,
    sharedById: 'u1',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    sharedBy: { id: 'u1', name: 'Alice', email: 'a@b.com' },
    ...overrides,
  });

  function build() {
    const prisma = {
      video: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const oembed = {
      fetch: jest.fn().mockResolvedValue({
        title: 'Never Gonna Give You Up',
        author: 'Rick',
        thumbnailUrl: null,
      }),
    };
    const jobs = { enqueueVideoShared: jest.fn().mockResolvedValue(undefined) };
    const service = new VideosService(
      prisma as unknown as PrismaService,
      oembed as unknown as YoutubeOembedClient,
      jobs as unknown as JobsService,
    );
    return { service, prisma, oembed, jobs };
  }

  it('rejects URLs that are not YouTube links', async () => {
    const { service } = build();
    await expect(
      service.share('u1', { url: 'https://example.com/foo' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns 409 with the existing video on duplicate share', async () => {
    const { service, prisma, jobs } = build();
    prisma.video.findUnique.mockResolvedValue(mkVideo());

    await expect(
      service.share('u2', { url: 'https://youtu.be/dQw4w9WgXcQ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(jobs.enqueueVideoShared).not.toHaveBeenCalled();
  });

  it('persists a new video and enqueues a fan-out job', async () => {
    const { service, prisma, jobs, oembed } = build();
    prisma.video.findUnique.mockResolvedValue(null);
    prisma.video.create.mockResolvedValue(mkVideo());

    const result = await service.share('u1', { url: 'https://youtu.be/dQw4w9WgXcQ' });

    expect(oembed.fetch).toHaveBeenCalledWith('dQw4w9WgXcQ');
    expect(prisma.video.create).toHaveBeenCalled();
    expect(jobs.enqueueVideoShared).toHaveBeenCalledWith({
      videoId: 'v1',
      sharedById: 'u1',
    });
    expect(result.youtubeId).toBe('dQw4w9WgXcQ');
  });

  it('lists videos with cursor pagination', async () => {
    const { service, prisma } = build();
    prisma.video.findMany.mockResolvedValue([mkVideo({ id: 'v1' }), mkVideo({ id: 'v2' })]);

    const res = await service.list({ limit: 1 });

    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).not.toBeNull();
  });
});
