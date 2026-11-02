import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Env } from '../../infra/config/env.schema';
import { ForbiddenOrigin } from '../../modules/auth/errors/forbidden-origin';
import { Authenticated, PanelOriginOnly, Public } from './access.decorators';
import { OriginGuard } from './origin.guard';

class Routes {
  @Authenticated() changePassword() {}
  @Public() webhook() {}
  @Public() @PanelOriginOnly() acceptInvitation() {}
}

describe('OriginGuard', () => {
  const env: Record<string, string> = { NODE_ENV: 'production', APP_DOMAIN: 'casaria.test' };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
  const guard = new OriginGuard(new Reflector(), config);

  const contextFor = (handler: () => void, method: string, origin?: string) =>
    ({
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ method, headers: { origin } }) }),
    }) as unknown as ExecutionContext;

  it.each([undefined, 'https://ana-e-bia.casaria.test', 'https://evil.example'])(
    'rejects an authenticated POST from %s with 403 auth.forbidden_origin',
    (origin) => {
      expect(() =>
        guard.canActivate(contextFor(Routes.prototype.changePassword, 'POST', origin)),
      ).toThrow(ForbiddenOrigin);
    },
  );

  it('accepts the panel origin', () => {
    expect(
      guard.canActivate(
        contextFor(Routes.prototype.changePassword, 'PUT', 'https://app.casaria.test'),
      ),
    ).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not check %s', (method) => {
    expect(guard.canActivate(contextFor(Routes.prototype.changePassword, method))).toBe(true);
  });

  it('does not check public routes', () => {
    expect(guard.canActivate(contextFor(Routes.prototype.webhook, 'POST'))).toBe(true);
  });

  it('checks a public route marked @PanelOriginOnly', () => {
    expect(() => guard.canActivate(contextFor(Routes.prototype.acceptInvitation, 'POST'))).toThrow(
      ForbiddenOrigin,
    );
    expect(
      guard.canActivate(
        contextFor(Routes.prototype.acceptInvitation, 'POST', 'https://app.casaria.test'),
      ),
    ).toBe(true);
  });
});
