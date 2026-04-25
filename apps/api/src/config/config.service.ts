import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('7d'),

  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
});

type Env = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
  private readonly env: Env;

  constructor() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const logger = new Logger('AppConfig');
      logger.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
      throw new Error('Invalid environment configuration');
    }
    this.env = parsed.data;
  }

  get nodeEnv() {
    return this.env.NODE_ENV;
  }
  get port() {
    return this.env.PORT;
  }
  get logLevel() {
    return this.env.LOG_LEVEL;
  }
  get databaseUrl() {
    return this.env.DATABASE_URL;
  }
  get redisUrl() {
    return this.env.REDIS_URL;
  }
  get jwtAccessSecret() {
    return this.env.JWT_ACCESS_SECRET;
  }
  get jwtAccessTtl() {
    return this.env.JWT_ACCESS_TTL;
  }
  get corsOrigins(): string[] | boolean {
    const raw = this.env.CORS_ORIGIN;
    if (raw === '*') return true;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  get throttleTtl() {
    return this.env.THROTTLE_TTL;
  }
  get throttleLimit() {
    return this.env.THROTTLE_LIMIT;
  }
}
