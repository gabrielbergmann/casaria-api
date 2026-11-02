import type { RedisClient } from './redis-client';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const redis = { eval: jest.fn() };
  const storage = new RedisThrottlerStorage(redis as unknown as RedisClient);

  beforeEach(() => jest.resetAllMocks());

  it('counts the hit under the casaria:throttle: prefix', async () => {
    redis.eval.mockResolvedValue([1, 60_000, 0, 0]);

    await storage.increment('hash-of-ip', 60_000, 120, 60_000, 'default');

    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['casaria:throttle:default:hash-of-ip'],
      arguments: ['60000', '120', '60000'],
    });
  });

  it('reports an allowed hit with the window left in seconds', async () => {
    redis.eval.mockResolvedValue([5, 42_100, 0, 0]);

    const record = await storage.increment('k', 60_000, 120, 60_000, 'default');

    expect(record).toEqual({
      totalHits: 5,
      timeToExpire: 43,
      isBlocked: false,
      timeToBlockExpire: -1,
    });
  });

  it('reports the 121st hit as blocked', async () => {
    redis.eval.mockResolvedValue([121, 30_000, 60_000, 1]);

    const record = await storage.increment('k', 60_000, 120, 60_000, 'default');

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(60);
  });
});
