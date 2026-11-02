import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { initialSiteConfig } from './initial-site-config';
import { SiteRepository } from './site.repository';

describe('SiteRepository', () => {
  const prisma = { siteConfig: { findUnique: jest.fn(), upsert: jest.fn() } };
  const repository = new SiteRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes reads and writes by weddingId', async () => {
    const config = initialSiteConfig();

    await repository.find('wedding-a');
    await repository.isPublished('wedding-a');
    await repository.saveDraft('wedding-a', config);
    await repository.publish('wedding-a', config, new Date());

    expectWeddingScoped(prisma.siteConfig.findUnique, 'wedding-a');
    expectWeddingScoped(prisma.siteConfig.upsert, 'wedding-a');
    for (const [args] of prisma.siteConfig.upsert.mock.calls) {
      expect(args.create.weddingId).toBe('wedding-a');
    }
  });

  it('saves only the draft, never the published version', async () => {
    const config = initialSiteConfig();

    await repository.saveDraft('wedding-a', config);

    const [[args]] = prisma.siteConfig.upsert.mock.calls;
    expect(args.update).toEqual({ draft: config });
    expect(args.create).toEqual({ weddingId: 'wedding-a', draft: config });
  });

  it('publishes keeping the draft, or creating it with the published document', async () => {
    const config = initialSiteConfig();
    const now = new Date('2026-10-25T12:00:00Z');

    await repository.publish('wedding-a', config, now);

    const [[args]] = prisma.siteConfig.upsert.mock.calls;
    expect(args.update).toEqual({ published: config, publishedAt: now });
    expect(args.create).toEqual({
      weddingId: 'wedding-a',
      draft: config,
      published: config,
      publishedAt: now,
    });
  });

  it('is published only with a publication date', async () => {
    prisma.siteConfig.findUnique.mockResolvedValueOnce(null);
    prisma.siteConfig.findUnique.mockResolvedValueOnce({ publishedAt: null });
    prisma.siteConfig.findUnique.mockResolvedValueOnce({ publishedAt: new Date() });

    await expect(repository.isPublished('wedding-a')).resolves.toBe(false);
    await expect(repository.isPublished('wedding-a')).resolves.toBe(false);
    await expect(repository.isPublished('wedding-a')).resolves.toBe(true);
  });
});
