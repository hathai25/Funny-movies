import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { JobsService, NOTIFICATIONS_QUEUE } from './jobs.service';

@Global()
@Module({
  providers: [RedisService, JobsService],
  exports: [RedisService, JobsService],
})
export class JobsModule {}

export { NOTIFICATIONS_QUEUE };
