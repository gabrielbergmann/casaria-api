import type { RedisClient } from '../../infra/redis/redis-client';
import { CodeAttempts } from './code-attempts';
import { InvitationCodeBlocked } from './errors/rsvp-errors';

describe('CodeAttempts', () => {
  const redis = { pTTL: jest.fn(), eval: jest.fn() };
  const attempts = new CodeAttempts(redis as unknown as RedisClient);

  beforeEach(() => jest.resetAllMocks());

  it('lets an IP without a block through', async () => {
    redis.pTTL.mockResolvedValue(-2);

    await expect(attempts.assertNotBlocked('203.0.113.7')).resolves.toBeUndefined();
    expect(redis.pTTL).toHaveBeenCalledWith('casaria:invitation-code:block:203.0.113.7');
  });

  it('answers 429 invitation.code_blocked with Retry-After while the block lasts', async () => {
    redis.pTTL.mockResolvedValue(1_800_500);

    const error = await attempts.assertNotBlocked('203.0.113.7').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvitationCodeBlocked);
    expect(error).toMatchObject({ status: 429, code: 'invitation.code_blocked' });
    expect((error as InvitationCodeBlocked).headers).toEqual({ 'Retry-After': '1801' });
  });

  it('counts an error per IP in a 1-hour window that blocks at the 10th', async () => {
    await attempts.registerFailure('203.0.113.7');

    const [script, options] = redis.eval.mock.calls[0];
    expect(script).toContain("redis.call('INCR', KEYS[1])");
    expect(options).toEqual({
      keys: [
        'casaria:invitation-code:errors:203.0.113.7',
        'casaria:invitation-code:block:203.0.113.7',
      ],
      arguments: ['3600000', '10'],
    });
  });
});
