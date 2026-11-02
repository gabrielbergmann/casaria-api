import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenRole } from '../../modules/auth/errors/forbidden-role';
import { SessionRequired } from '../../modules/auth/errors/session-required';
import type { SessionService } from '../../modules/auth/session.service';
import { TERMS_VERSION } from '../personal-data/terms';
import { AccessGuard } from './access.guard';
import { Authenticated, Public, Roles, SuperadminOnly, TermsExempt } from './access.decorators';

class Routes {
  @Public() publicRoute() {}
  @Authenticated() authenticatedRoute() {}
  @Authenticated() @TermsExempt() termsExemptRoute() {}
  @SuperadminOnly() superadminRoute() {}
  @Roles('owner', 'editor') rolesRoute() {}
  undeclaredRoute() {}
}

describe('AccessGuard', () => {
  const sessions = { authenticate: jest.fn() };
  const guard = new AccessGuard(new Reflector(), sessions as unknown as SessionService);
  const member = { id: 'user-1', isSuperadmin: false, termsAcceptedVersion: TERMS_VERSION };
  const superadmin = { id: 'user-root', isSuperadmin: true, termsAcceptedVersion: TERMS_VERSION };

  const contextFor = (handler: () => void, routePath = '/v1/auth/me') =>
    ({
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ route: { path: routePath } }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.resetAllMocks());

  it('lets public routes through without a session', async () => {
    await expect(guard.canActivate(contextFor(Routes.prototype.publicRoute))).resolves.toBe(true);
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it.each([
    ['authenticated', Routes.prototype.authenticatedRoute],
    ['superadmin', Routes.prototype.superadminRoute],
    ['roles', Routes.prototype.rolesRoute],
    ['undeclared', Routes.prototype.undeclaredRoute],
  ])('requires a valid session on %s routes', async (_kind, handler) => {
    sessions.authenticate.mockRejectedValue(new SessionRequired());

    await expect(
      guard.canActivate(contextFor(handler, '/v1/weddings/:weddingId')),
    ).rejects.toBeInstanceOf(SessionRequired);
  });

  it('accepts any session on @Authenticated routes', async () => {
    sessions.authenticate.mockResolvedValue(member);

    await expect(guard.canActivate(contextFor(Routes.prototype.authenticatedRoute))).resolves.toBe(
      true,
    );
  });

  it('opens superadmin routes only to is_superadmin', async () => {
    sessions.authenticate.mockResolvedValue(member);
    await expect(
      guard.canActivate(contextFor(Routes.prototype.superadminRoute)),
    ).rejects.toBeInstanceOf(ForbiddenRole);

    sessions.authenticate.mockResolvedValue(superadmin);
    await expect(guard.canActivate(contextFor(Routes.prototype.superadminRoute))).resolves.toBe(
      true,
    );
  });

  it('denies an undeclared route outside a wedding, even to the superadmin', async () => {
    sessions.authenticate.mockResolvedValue(superadmin);

    await expect(
      guard.canActivate(contextFor(Routes.prototype.undeclaredRoute, '/v1/things')),
    ).rejects.toMatchObject({
      status: 403,
      code: 'auth.forbidden_role',
    });
  });

  it('leaves wedding routes to the role check of the WeddingMemberGuard', async () => {
    sessions.authenticate.mockResolvedValue(member);

    for (const handler of [Routes.prototype.rolesRoute, Routes.prototype.undeclaredRoute]) {
      await expect(
        guard.canActivate(contextFor(handler, '/v1/weddings/:weddingId/guests')),
      ).resolves.toBe(true);
    }
  });

  it('denies @Roles on a route that is not of a wedding', async () => {
    sessions.authenticate.mockResolvedValue(member);

    await expect(
      guard.canActivate(contextFor(Routes.prototype.rolesRoute, '/v1/things')),
    ).rejects.toBeInstanceOf(ForbiddenRole);
  });

  describe('terms acceptance (spec 015 RF10)', () => {
    it.each([
      ['never accepted', null],
      ['an older version', '2000-01-01'],
    ])('answers 403 terms.acceptance_required on a wedding route when %s', async (_c, version) => {
      sessions.authenticate.mockResolvedValue({ ...member, termsAcceptedVersion: version });

      await expect(
        guard.canActivate(contextFor(Routes.prototype.rolesRoute, '/v1/weddings/:weddingId')),
      ).rejects.toMatchObject({ status: 403, code: 'terms.acceptance_required' });
      await expect(
        guard.canActivate(contextFor(Routes.prototype.authenticatedRoute)),
      ).rejects.toMatchObject({ code: 'terms.acceptance_required' });
    });

    it('lets /auth/me, logout and the acceptance through before accepting', async () => {
      sessions.authenticate.mockResolvedValue({ ...member, termsAcceptedVersion: null });

      await expect(guard.canActivate(contextFor(Routes.prototype.termsExemptRoute))).resolves.toBe(
        true,
      );
    });
  });
});
