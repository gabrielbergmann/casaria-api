import { RedisStore } from 'connect-redis';
import type { SessionOptions } from 'express-session';
import type { RedisClient } from '../../infra/redis/redis-client';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Expira depois de 7 dias sem uso: cada requisição renova o cookie e o TTL no Redis. */
export const SESSION_IDLE_MS = 7 * DAY_MS;
/** Dura no máximo 30 dias desde o login, mesmo em uso (conferido pelo AccessGuard). */
export const SESSION_MAX_AGE_MS = 30 * DAY_MS;

export const sessionCookieName = (nodeEnv: string) =>
  nodeEnv === 'production' ? '__Host-sid' : 'sid';

declare module 'express-session' {
  interface SessionData {
    createdAt: number;
    sessionVersion: number;
  }
}

// Sessão server-side no Redis (ADR-005). __Host- exige https e proíbe Domain, então nenhum
// subdomínio de casal recebe o cookie; em desenvolvimento (http) o nome fica sem prefixo.
export function buildSessionOptions(
  env: { nodeEnv: string; secret: string },
  redis: RedisClient,
): SessionOptions {
  const isProduction = env.nodeEnv === 'production';
  return {
    name: sessionCookieName(env.nodeEnv),
    secret: env.secret,
    store: new RedisStore({ client: redis, prefix: 'sess:' }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_IDLE_MS,
    },
  };
}
