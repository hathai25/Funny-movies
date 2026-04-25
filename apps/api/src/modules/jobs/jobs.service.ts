import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from './redis.service';

export const NOTIFICATIONS_QUEUE = 'notifications';

export interface VideoSharedJob {
  videoId: string;
  sharedById: string;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private notificationsQueue!: Queue<VideoSharedJob>;

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    this.notificationsQueue = new Queue<VideoSharedJob>(NOTIFICATIONS_QUEUE, {
      connection: this.redis.client,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }

  async onModuleDestroy() {
    await this.notificationsQueue?.close();
  }

  get queue() {
    return this.notificationsQueue;
  }

  async enqueueVideoShared(payload: VideoSharedJob): Promise<void> {
    await this.notificationsQueue.add('video.shared', payload);
    this.logger.debug(`enqueued video.shared for video=${payload.videoId}`);
  }
}
