import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../jobs/redis.service';
import { NOTIFICATIONS_QUEUE, type VideoSharedJob } from '../jobs/jobs.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker?: Worker<VideoSharedJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: NotificationsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<VideoSharedJob>(
      NOTIFICATIONS_QUEUE,
      async (job) => this.handle(job),
      { connection: this.redis.client, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`job ${job?.id} failed: ${err.message}`, err.stack);
    });
    this.worker.on('completed', (job) => {
      this.logger.debug(`job ${job.id} completed`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async handle(job: Job<VideoSharedJob>): Promise<void> {
    const { videoId, sharedById } = job.data;
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { sharedBy: { select: { id: true, name: true } } },
    });
    if (!video) {
      this.logger.warn(`video ${videoId} not found; skipping job`);
      return;
    }

    const recipientIds = await this.notifications.listRecipientIds(sharedById);
    if (recipientIds.length === 0) {
      this.logger.debug(`no recipients for video ${videoId}`);
      return;
    }

    const payload = {
      title: video.title,
      sharerName: video.sharedBy.name,
      videoId: video.id,
      youtubeId: video.youtubeId,
      thumbnailUrl: video.thumbnailUrl,
    };

    await this.notifications.createMany(
      recipientIds.map((userId) => ({
        userId,
        videoId: video.id,
        payload,
      })),
    );

    for (const userId of recipientIds) {
      const notif = await this.notifications.findByUserAndVideo(userId, video.id);
      if (!notif) continue;
      this.gateway.emitNotification(userId, {
        id: notif.id,
        videoId: video.id,
        title: video.title,
        sharerName: video.sharedBy.name,
        youtubeId: video.youtubeId,
        thumbnailUrl: video.thumbnailUrl,
        createdAt: notif.createdAt.toISOString(),
      });
    }

    this.logger.log(`fan-out video=${video.id} -> ${recipientIds.length} users`);
  }
}
