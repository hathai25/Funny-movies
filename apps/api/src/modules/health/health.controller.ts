import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../jobs/redis.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const ok = db === 'ok' && redis === 'ok';
    return {
      status: ok ? 'ok' : 'degraded',
      db,
      redis,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<'ok' | string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (e) {
      return (e as Error).message;
    }
  }

  private async checkRedis(): Promise<'ok' | string> {
    try {
      const pong = await this.redis.client.ping();
      return pong === 'PONG' ? 'ok' : pong;
    } catch (e) {
      return (e as Error).message;
    }
  }
}
