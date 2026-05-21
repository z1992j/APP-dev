// Shared ioredis singleton. Resolved from REDIS_URL.
// Use REDIS_CLIENT token to inject into services.

import { Global, Module, Logger, Provider, OnApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => {
    const url = cfg.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    const log = new Logger('Redis');
    client.on('error', (e) => log.warn(`redis error: ${e.message}`));
    client.on('connect', () => log.log(`connected to ${url.replace(/:[^:@/]*@/, ':***@')}`));
    return client;
  },
};

@Injectable()
export class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}
  async onApplicationShutdown() {
    await this.client.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [redisProvider, RedisShutdown],
  exports: [redisProvider],
})
export class RedisModule {}
