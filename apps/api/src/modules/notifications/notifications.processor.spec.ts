import { NotificationsProcessor } from './notifications.processor';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../jobs/redis.service';
import type { NotificationsGateway } from './notifications.gateway';
import type { NotificationsService } from './notifications.service';
import type { Job } from 'bullmq';
import type { VideoSharedJob } from '../jobs/jobs.service';

const mkVideo = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  youtubeId: 'abc12345678',
  title: 'Funny Cat',
  thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
  sharedBy: { id: 'u1', name: 'Alice' },
  ...overrides,
});

function build() {
  const prisma = {
    video: { findUnique: jest.fn() },
  } as unknown as PrismaService & {
    video: { findUnique: jest.Mock };
  };
  const redis = {} as RedisService;
  const gateway = { emitNotification: jest.fn() } as unknown as NotificationsGateway & {
    emitNotification: jest.Mock;
  };
  const notifications = {
    listRecipientIds: jest.fn(),
    createMany: jest.fn().mockResolvedValue(undefined),
    findByUserAndVideo: jest.fn(),
  } as unknown as NotificationsService & {
    listRecipientIds: jest.Mock;
    createMany: jest.Mock;
    findByUserAndVideo: jest.Mock;
  };

  const processor = new NotificationsProcessor(prisma, redis, gateway, notifications);
  return { processor, prisma, gateway, notifications };
}

const mkJob = (data: VideoSharedJob): Job<VideoSharedJob> =>
  ({ id: 'j1', data }) as unknown as Job<VideoSharedJob>;

describe('NotificationsProcessor.handle', () => {
  it('skips when the video no longer exists', async () => {
    const { processor, prisma, gateway, notifications } = build();
    (prisma.video.findUnique as jest.Mock).mockResolvedValue(null);

    await processor.handle(mkJob({ videoId: 'missing', sharedById: 'u1' }));

    expect(notifications.createMany).not.toHaveBeenCalled();
    expect(notifications.listRecipientIds).not.toHaveBeenCalled();
    expect(gateway.emitNotification).not.toHaveBeenCalled();
  });

  it('skips when there are no recipients (sharer alone in the system)', async () => {
    const { processor, prisma, gateway, notifications } = build();
    (prisma.video.findUnique as jest.Mock).mockResolvedValue(mkVideo());
    notifications.listRecipientIds.mockResolvedValue([]);

    await processor.handle(mkJob({ videoId: 'v1', sharedById: 'u1' }));

    expect(notifications.createMany).not.toHaveBeenCalled();
    expect(gateway.emitNotification).not.toHaveBeenCalled();
  });

  it('batch-creates rows and emits one event per recipient', async () => {
    const { processor, prisma, gateway, notifications } = build();
    (prisma.video.findUnique as jest.Mock).mockResolvedValue(mkVideo());
    notifications.listRecipientIds.mockResolvedValue(['u2', 'u3']);
    notifications.findByUserAndVideo.mockImplementation((userId: string, videoId: string) =>
      Promise.resolve({
        id: `n-${userId}`,
        videoId,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
    );

    await processor.handle(mkJob({ videoId: 'v1', sharedById: 'u1' }));

    expect(notifications.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u2', videoId: 'v1' }),
      expect.objectContaining({ userId: 'u3', videoId: 'v1' }),
    ]);
    expect(gateway.emitNotification).toHaveBeenCalledTimes(2);
    expect(gateway.emitNotification).toHaveBeenNthCalledWith(
      1,
      'u2',
      expect.objectContaining({
        id: 'n-u2',
        videoId: 'v1',
        title: 'Funny Cat',
        sharerName: 'Alice',
        youtubeId: 'abc12345678',
      }),
    );
    expect(gateway.emitNotification).toHaveBeenNthCalledWith(
      2,
      'u3',
      expect.objectContaining({ id: 'n-u3' }),
    );
  });

  it('skips emit if the row was not found post-insert (defensive)', async () => {
    const { processor, prisma, gateway, notifications } = build();
    (prisma.video.findUnique as jest.Mock).mockResolvedValue(mkVideo());
    notifications.listRecipientIds.mockResolvedValue(['u2', 'u3']);
    notifications.findByUserAndVideo.mockImplementation((userId: string) =>
      Promise.resolve(
        userId === 'u2' ? null : { id: 'n-u3', videoId: 'v1', createdAt: new Date() },
      ),
    );

    await processor.handle(mkJob({ videoId: 'v1', sharedById: 'u1' }));

    expect(gateway.emitNotification).toHaveBeenCalledTimes(1);
    expect(gateway.emitNotification).toHaveBeenCalledWith('u3', expect.any(Object));
  });
});
