import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client!: Redis;
  private _pub!: Redis;
  private _sub!: Redis;

  constructor(private readonly cfg: AppConfigService) {}

  onModuleInit() {
    const opts = { maxRetriesPerRequest: null, enableReadyCheck: false };
    this._client = new IORedis(this.cfg.redisUrl, opts);
    this._pub = new IORedis(this.cfg.redisUrl, opts);
    this._sub = new IORedis(this.cfg.redisUrl, opts);
    this._client.on('error', (e) => this.logger.error(`redis error: ${e.message}`));
  }

  async onModuleDestroy() {
    await Promise.allSettled([this._client?.quit(), this._pub?.quit(), this._sub?.quit()]);
  }

  get client(): Redis {
    return this._client;
  }
  get pub(): Redis {
    return this._pub;
  }
  get sub(): Redis {
    return this._sub;
  }

  bullConnection() {
    return { connection: this._client };
  }
}
