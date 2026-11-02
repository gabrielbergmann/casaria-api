import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { ForbiddenRole } from '../../modules/auth/errors/forbidden-role';
import type { MembersService } from '../../modules/auth/members.service';
import { WeddingNotFound } from '../../modules/weddings/errors/wedding-not-found';
import type { WeddingsService } from '../../modules/weddings/weddings.service';
import { Roles } from '../auth/access.decorators';
import type { RequestUser, TenantRequest } from './tenant-context';
import { WeddingMemberGuard } from './wedding-member.guard';

// Rotas de exemplo: conteúdo (owner e editor) e uma sem declaração (só owner).
class GuestsRoutes {
  @Roles('owner', 'editor')
  list() {}

  settings() {}
}

const WEDDING_A = '01890000-0000-7000-8000-00000000000a';
const WEDDING_B = '01890000-0000-7000-8000-00000000000b';
const MISSING = '01890000-0000-7000-8000-0000000000ff';

describe('WeddingMemberGuard', () => {
  const weddings = { exists: jest.fn() };
  const members = { findRole: jest.fn() };
  const logger = { assign: jest.fn() };
  const guard = new WeddingMemberGuard(
    new Reflector(),
    weddings as unknown as WeddingsService,
    members as unknown as MembersService,
    logger as unknown as PinoLogger,
  );

  const editorOfA: RequestUser = { id: 'user-editor', isSuperadmin: false };
  const superadmin: RequestUser = { id: 'user-root', isSuperadmin: true };

  const contextFor = (
    weddingId: string,
    user: RequestUser | undefined,
    extra: Partial<TenantRequest> = {},
    routePath = '/v1/weddings/:weddingId/guests',
    handler: () => void = GuestsRoutes.prototype.list,
  ) => {
    const req = {
      params: { weddingId },
      route: { path: routePath },
      user,
      ...extra,
    } as TenantRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => GuestsRoutes,
    } as unknown as ExecutionContext;
    return { req, context };
  };

  beforeEach(() => {
    jest.resetAllMocks();
    // Banco falso: o editor só é membro de A; A e B existem.
    members.findRole.mockImplementation(async (weddingId: string, userId: string) =>
      weddingId === WEDDING_A && userId === editorOfA.id ? 'editor' : null,
    );
    weddings.exists.mockImplementation(async (weddingId: string) =>
      [WEDDING_A, WEDDING_B].includes(weddingId),
    );
  });

  const failure = (context: ExecutionContext) =>
    guard.canActivate(context).catch((e: unknown) => e);

  it('gives the editor of A the editor role in A', async () => {
    const { req, context } = contextFor(WEDDING_A, editorOfA);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.tenant).toEqual({ weddingId: WEDDING_A, role: 'editor' });
    expect(logger.assign).toHaveBeenCalledWith({ weddingId: WEDDING_A });
  });

  it('answers the editor of A on B with the same 404 as a missing wedding', async () => {
    const onB = await failure(contextFor(WEDDING_B, editorOfA).context);
    const onMissing = await failure(contextFor(MISSING, editorOfA).context);

    expect(onB).toBeInstanceOf(WeddingNotFound);
    expect(onMissing).toBeInstanceOf(WeddingNotFound);
    expect(onB).toMatchObject({ status: 404, code: 'wedding.not_found' });
    expect({ ...(onB as object) }).toEqual({ ...(onMissing as object) });
  });

  it('treats the superadmin as owner of any existing wedding, without a membership', async () => {
    const { req, context } = contextFor(WEDDING_B, superadmin, { method: 'PATCH' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.tenant).toEqual({ weddingId: WEDDING_B, role: 'owner' });
    expect(members.findRole).not.toHaveBeenCalled();
  });

  it('denies the superadmin a wedding that does not exist', async () => {
    await expect(failure(contextFor(MISSING, superadmin).context)).resolves.toBeInstanceOf(
      WeddingNotFound,
    );
  });

  it('reads the membership from the database on every request', async () => {
    const { context } = contextFor(WEDDING_A, editorOfA);
    await guard.canActivate(context);
    members.findRole.mockResolvedValue(null);

    await expect(failure(contextFor(WEDDING_A, editorOfA).context)).resolves.toBeInstanceOf(
      WeddingNotFound,
    );
    expect(members.findRole).toHaveBeenCalledTimes(2);
  });

  it('ignores a weddingId sent in the body or in the query', async () => {
    const { req, context } = contextFor(WEDDING_A, editorOfA, {
      body: { weddingId: WEDDING_B },
      query: { weddingId: WEDDING_B },
    } as Partial<TenantRequest>);

    await guard.canActivate(context);

    expect(req.tenant?.weddingId).toBe(WEDDING_A);
    expect(members.findRole).toHaveBeenCalledWith(WEDDING_A, editorOfA.id);
  });

  it('rejects an id that is not a UUID without touching the database', async () => {
    await expect(failure(contextFor('not-a-uuid', editorOfA).context)).resolves.toBeInstanceOf(
      WeddingNotFound,
    );
    expect(members.findRole).not.toHaveBeenCalled();
  });

  it('rejects a panel route without an authenticated user', async () => {
    await expect(failure(contextFor(WEDDING_A, undefined).context)).resolves.toBeInstanceOf(
      WeddingNotFound,
    );
  });

  it('requires owner on a wedding route without @Roles', async () => {
    const editorOnSettings = contextFor(
      WEDDING_A,
      editorOfA,
      {},
      undefined,
      GuestsRoutes.prototype.settings,
    );
    const rootOnSettings = contextFor(
      WEDDING_A,
      superadmin,
      {},
      undefined,
      GuestsRoutes.prototype.settings,
    );

    await expect(failure(editorOnSettings.context)).resolves.toBeInstanceOf(ForbiddenRole);
    await expect(guard.canActivate(rootOnSettings.context)).resolves.toBe(true);
  });

  it('answers 403 auth.forbidden_role, not 404, to a member with a weaker role', async () => {
    const error = await failure(
      contextFor(WEDDING_A, editorOfA, {}, undefined, GuestsRoutes.prototype.settings).context,
    );

    expect(error).toMatchObject({ status: 403, code: 'auth.forbidden_role' });
  });

  it('does nothing outside /v1/weddings/:weddingId', async () => {
    const { req, context } = contextFor(
      WEDDING_A,
      undefined,
      {},
      '/v1/webhooks/mercadopago/:weddingId',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
    expect(members.findRole).not.toHaveBeenCalled();
  });
});
