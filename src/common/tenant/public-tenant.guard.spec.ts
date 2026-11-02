import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../infra/config/env.schema';
import type { TransactionRunner } from '../../infra/prisma/transaction-runner';
import type { Clock } from '../time/clock';
import type { MediaService } from '../../modules/media/media.service';
import type { SiteRepository } from '../../modules/site/site.repository';
import { SiteService } from '../../modules/site/site.service';
import { WeddingNotFound } from '../../modules/weddings/errors/wedding-not-found';
import type { WeddingsRepository } from '../../modules/weddings/weddings.repository';
import { WeddingsService } from '../../modules/weddings/weddings.service';
import { PublicTenantGuard } from './public-tenant.guard';
import type { TenantRequest } from './tenant-context';

describe('PublicTenantGuard', () => {
  // ana-e-bia é o slug atual e publicado; ana-bia só redireciona; rascunho nunca publicou.
  const weddingsRepository = {
    findIdBySlug: jest.fn(
      async (slug: string) =>
        ({ 'ana-e-bia': 'wedding-a', rascunho: 'wedding-draft' })[slug] ?? null,
    ),
    findRedirectTarget: jest.fn(async () => 'ana-e-bia'),
  };
  const siteRepository = {
    isPublished: jest.fn(async (weddingId: string) => weddingId === 'wedding-a'),
  };
  const config = { get: () => 'casaria.test' } as unknown as ConfigService<Env, true>;
  const files = { deleteWeddingFiles: jest.fn() };
  const weddings = new WeddingsService(
    weddingsRepository as unknown as WeddingsRepository,
    config,
    files,
  );
  const sites = new SiteService(
    siteRepository as unknown as SiteRepository,
    weddings,
    {} as MediaService,
    {} as TransactionRunner,
    {} as Clock,
  );
  const logger = { assign: jest.fn() };
  const guard = new PublicTenantGuard(sites, logger as unknown as PinoLogger);

  const contextFor = (slug: string, extra: Partial<TenantRequest> = {}) => {
    const req = { params: { slug }, ...extra } as TenantRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, context };
  };

  it('resolves /v1/public/sites/ana-e-bia by its current slug', async () => {
    const { req, context } = contextFor('ana-e-bia');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.tenant).toEqual({ weddingId: 'wedding-a' });
    expect(logger.assign).toHaveBeenCalledWith({ weddingId: 'wedding-a' });
  });

  it('answers 404 for a redirected slug instead of following it', async () => {
    await expect(guard.canActivate(contextFor('ana-bia').context)).rejects.toBeInstanceOf(
      WeddingNotFound,
    );
    expect(weddingsRepository.findRedirectTarget).not.toHaveBeenCalled();
  });

  it('answers the same 404 while the site was never published, even for members', async () => {
    const { req, context } = contextFor('rascunho', {
      user: { id: 'owner-1', isSuperadmin: false },
    } as Partial<TenantRequest>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(WeddingNotFound);
    expect(siteRepository.isPublished).toHaveBeenCalledWith('wedding-draft');
    expect(req.tenant).toBeUndefined();
  });

  it('ignores a weddingId sent in the body or in the query', async () => {
    const { req, context } = contextFor('ana-e-bia', {
      body: { weddingId: 'wedding-b' },
      query: { weddingId: 'wedding-b' },
    } as Partial<TenantRequest>);

    await guard.canActivate(context);

    expect(req.tenant?.weddingId).toBe('wedding-a');
  });
});
