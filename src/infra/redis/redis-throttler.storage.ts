import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RedisClient } from './redis-client';

export const THROTTLE_KEY_PREFIX = 'casaria:throttle:';

// Janela fixa atômica: conta o acesso, abre a janela no primeiro e bloqueia ao passar do limite.
// Retorna [totalHits, msParaExpirar, msParaDesbloquear, bloqueado].
const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local blockKey = key .. ':block'
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  return { limit + 1, blockTtl, blockTtl, 1 }
end

local hits = redis.call('INCR', key)
if hits == 1 then
  redis.call('PEXPIRE', key, ttl)
end
local keyTtl = redis.call('PTTL', key)

if hits > limit then
  if blockDuration > 0 then
    redis.call('SET', blockKey, '1', 'PX', blockDuration)
  end
  return { hits, keyTtl, blockDuration, 1 }
end
return { hits, keyTtl, 0, 0 }
`;

const toSeconds = (ms: number) => (ms > 0 ? Math.ceil(ms / 1000) : -1);

// Storage do @nestjs/throttler no Redis, com o prefixo casaria:throttle: (vale entre instâncias).
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisClient) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    const reply = (await this.redis.eval(FIXED_WINDOW_SCRIPT, {
      keys: [`${THROTTLE_KEY_PREFIX}${name}:${key}`],
      arguments: [String(ttl), String(limit), String(blockDuration)],
    })) as number[];
    const [totalHits, timeToExpireMs, timeToBlockExpireMs, isBlocked] = reply;
    return {
      totalHits,
      timeToExpire: toSeconds(timeToExpireMs),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: toSeconds(timeToBlockExpireMs),
    };
  }
}
