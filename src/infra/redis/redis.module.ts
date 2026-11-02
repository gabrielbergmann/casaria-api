import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { connectRedis, REDIS_CLIENT, type RedisClient } from './redis-client';

// Client node-redis único (sessão e rate limit). Aqui, só o throttler o usa.
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        connectRedis(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) await this.client.close();
  }
}
