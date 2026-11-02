import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import type { RequestUser, TenantRequest } from '../../common/tenant/tenant-context';
import { WeddingMemberGuard } from '../../common/tenant/wedding-member.guard';
import type { MembersService } from '../auth/members.service';
import { WeddingNotFound } from '../weddings/errors/wedding-not-found';
import type { WeddingsService } from '../weddings/weddings.service';
import { SiteController } from './site.controller';

const WEDDING_A = '01890000-0000-7000-8000-00000000000a';

// Spec 008 RF01: ler, salvar e publicar o rascunho só com papel owner ou editor no casamento.
describe('SiteController access', () => {
  const members = { findRole: jest.fn() };
  const guard = new WeddingMemberGuard(
    new Reflector(),
    {} as WeddingsService,
    members as unknown as MembersService,
    { assign: jest.fn() } as unknown as PinoLogger,
  );
  const user: RequestUser = { id: 'user-1', isSuperadmin: false };

  const contextFor = (handler: (...args: never[]) => unknown, routePath: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () =>
          ({
            params: { weddingId: WEDDING_A },
            route: { path: routePath },
            user,
          }) as unknown as TenantRequest,
      }),
      getHandler: () => handler,
      getClass: () => SiteController,
    }) as unknown as ExecutionContext;

  const routes = [
    [SiteController.prototype.get, '/v1/weddings/:weddingId/site'],
    [SiteController.prototype.saveDraft, '/v1/weddings/:weddingId/site/draft'],
    [SiteController.prototype.publish, '/v1/weddings/:weddingId/site/publish'],
  ] as const;

  beforeEach(() => jest.resetAllMocks());

  it.each(routes)('lets an editor of the wedding through %#', async (handler, path) => {
    members.findRole.mockResolvedValue('editor');

    await expect(guard.canActivate(contextFor(handler, path))).resolves.toBe(true);
  });

  it.each(routes)('refuses a user without a role in the wedding %#', async (handler, path) => {
    members.findRole.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor(handler, path))).rejects.toBeInstanceOf(
      WeddingNotFound,
    );
  });
});
