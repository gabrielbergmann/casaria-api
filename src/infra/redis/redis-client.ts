import { Logger } from '@nestjs/common';
import { createClient } from 'redis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const MAX_RECONNECT_DELAY_MS = 5_000;

// A API não sobe sem Redis (RF03): até a primeira conexão, falha sem tentar de novo;
// depois de pronta, reconecta com espera crescente.
export async function connectRedis(url: string) {
  const logger = new Logger('Redis');
  let ready = false;
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries, cause) =>
        ready ? Math.min(retries * 200, MAX_RECONNECT_DELAY_MS) : cause,
    },
  });
  client.on('ready', () => {
    ready = true;
  });
  client.on('error', (err: Error) => logger.error({ err }, 'redis_error'));
  await client.connect();
  return client;
}

export type RedisClient = Awaited<ReturnType<typeof connectRedis>>;
