import { Inject, Injectable } from '@nestjs/common';
import { hours } from '@nestjs/throttler';
import { REDIS_CLIENT, type RedisClient } from '../../infra/redis/redis-client';
import { InvitationCodeBlocked } from './errors/rsvp-errors';

const KEY_PREFIX = 'casaria:invitation-code:';
const WINDOW_MS = hours(1);
const MAX_ERRORS = 10;

// Conta um erro; no 10º da janela, bloqueia o IP pela mesma hora e zera a contagem.
const REGISTER_FAILURE_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
if hits >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[1])
  redis.call('DEL', KEYS[1])
end
return hits
`;

/**
 * Bloqueio de códigos de convite por IP (spec 010 RF04, RNF01): 10 erros em 1 hora bloqueiam o
 * IP por 1 hora, em qualquer casamento e entre instâncias. Só erros contam; o token não passa
 * por aqui.
 */
@Injectable()
export class CodeAttempts {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async assertNotBlocked(ip: string): Promise<void> {
    const remainingMs = await this.redis.pTTL(this.blockKey(ip));
    if (remainingMs > 0) throw new InvitationCodeBlocked(Math.ceil(remainingMs / 1000));
  }

  async registerFailure(ip: string): Promise<void> {
    await this.redis.eval(REGISTER_FAILURE_SCRIPT, {
      keys: [`${KEY_PREFIX}errors:${ip}`, this.blockKey(ip)],
      arguments: [String(WINDOW_MS), String(MAX_ERRORS)],
    });
  }

  private blockKey(ip: string): string {
    return `${KEY_PREFIX}block:${ip}`;
  }
}
