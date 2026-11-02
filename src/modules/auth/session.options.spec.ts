import type { CookieOptions } from 'express-session';
import type { RedisClient } from '../../infra/redis/redis-client';
import { buildSessionOptions, SESSION_IDLE_MS } from './session.options';

describe('buildSessionOptions', () => {
  const redis = {} as RedisClient;

  it('uses an httpOnly __Host- cookie without Domain in production', () => {
    const options = buildSessionOptions({ nodeEnv: 'production', secret: 's'.repeat(32) }, redis);

    expect(options.name).toBe('__Host-sid');
    expect(options.cookie).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    expect(options.cookie).not.toHaveProperty('domain');
  });

  it('renews the 7 idle days on every request and never stores anonymous sessions', () => {
    const options = buildSessionOptions({ nodeEnv: 'production', secret: 's'.repeat(32) }, redis);

    expect(options.rolling).toBe(true);
    expect((options.cookie as CookieOptions).maxAge).toBe(SESSION_IDLE_MS);
    expect(options.saveUninitialized).toBe(false);
    expect(options.resave).toBe(false);
  });

  it('drops the __Host- prefix and the secure flag on plain http in development', () => {
    const options = buildSessionOptions({ nodeEnv: 'development', secret: 's'.repeat(32) }, redis);

    expect(options.name).toBe('sid');
    expect((options.cookie as CookieOptions).secure).toBe(false);
  });
});
