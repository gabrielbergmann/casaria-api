import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { TooManyLoginAttempts } from '../errors/too-many-login-attempts';
import { LoginAttemptsGuard } from './login-attempts.guard';

describe('LoginAttemptsGuard', () => {
  // Storage em memória do próprio @nestjs/throttler, com a mesma interface do storage Redis.
  const storage = new ThrottlerStorageService();
  const guard = new LoginAttemptsGuard(storage);
  const contextFor = (ip: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ ip }) }) }) as unknown as ExecutionContext;

  afterAll(() => storage.onApplicationShutdown());

  it('blocks the 11th attempt of the same IP within 15 minutes, right or wrong', async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      await expect(guard.canActivate(contextFor('203.0.113.7'))).resolves.toBe(true);
    }

    const error = await guard.canActivate(contextFor('203.0.113.7')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyLoginAttempts);
    expect(error).toMatchObject({ status: 429, code: 'auth.too_many_attempts' });
  });

  it('counts each IP apart', async () => {
    await expect(guard.canActivate(contextFor('198.51.100.1'))).resolves.toBe(true);
  });

  it('uses the login throttler window of 15 minutes', async () => {
    const spy = { increment: jest.fn().mockResolvedValue({ isBlocked: false }) };

    await new LoginAttemptsGuard(spy as never).canActivate(contextFor('192.0.2.1'));

    expect(spy.increment).toHaveBeenCalledWith('192.0.2.1', 900_000, 10, 900_000, 'login');
  });
});
