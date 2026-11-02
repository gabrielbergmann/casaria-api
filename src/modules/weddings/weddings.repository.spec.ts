import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { WeddingsRepository } from './weddings.repository';

describe('WeddingsRepository', () => {
  const prisma = {
    $transaction: jest.fn(),
    wedding: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    slugRedirect: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  };
  const repository = new WeddingsRepository(prisma as unknown as PrismaService);
  const now = new Date('2027-03-10T12:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    // Cada operação vira um objeto que descreve a chamada, para inspecionar a transação.
    prisma.slugRedirect.deleteMany.mockImplementation((args) => ({ op: 'deleteRedirects', args }));
    prisma.wedding.update.mockImplementation((args) => ({ op: 'updateWedding', args }));
    prisma.slugRedirect.create.mockImplementation((args) => ({ op: 'createRedirect', args }));
  });

  it('finds a redirect target only while it is valid', async () => {
    prisma.wedding.findFirst.mockResolvedValue({ slug: 'ana-e-bia' });

    await expect(repository.findRedirectTarget('ana-bia', now)).resolves.toBe('ana-e-bia');
    expect(prisma.wedding.findFirst).toHaveBeenCalledWith({
      where: { slugRedirects: { some: { oldSlug: 'ana-bia', expiresAt: { gt: now } } } },
      select: { slug: true },
    });
  });

  it('changes the slug and records the old one for 90 days in one transaction', async () => {
    prisma.$transaction.mockResolvedValue([]);

    await expect(repository.changeSlug('wedding-a', 'ana-bia', 'ana-e-bia', now)).resolves.toBe(
      true,
    );

    const [operations] = prisma.$transaction.mock.calls[0];
    expect(operations).toEqual([
      {
        op: 'deleteRedirects',
        args: {
          where: {
            oldSlug: 'ana-e-bia',
            OR: [{ weddingId: 'wedding-a' }, { expiresAt: { lte: now } }],
          },
        },
      },
      { op: 'updateWedding', args: { where: { id: 'wedding-a' }, data: { slug: 'ana-e-bia' } } },
      {
        op: 'createRedirect',
        args: {
          data: {
            oldSlug: 'ana-bia',
            weddingId: 'wedding-a',
            expiresAt: new Date('2027-06-08T12:00:00Z'),
          },
        },
      },
    ]);
  });

  it('removes its own redirect when the couple goes back to the old slug', async () => {
    prisma.$transaction.mockResolvedValue([]);

    await repository.changeSlug('wedding-a', 'ana-e-bia', 'ana-bia', now);

    const [operations] = prisma.$transaction.mock.calls[0];
    expect(operations[0].args.where).toMatchObject({ oldSlug: 'ana-bia' });
    expect(operations[2].args.data).toMatchObject({ oldSlug: 'ana-e-bia', weddingId: 'wedding-a' });
  });

  it('reports a unique-index collision as unavailable', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(repository.changeSlug('wedding-a', 'ana-bia', 'ana-e-bia', now)).resolves.toBe(
      false,
    );
  });

  it('checks availability against other weddings only', async () => {
    prisma.wedding.findFirst.mockResolvedValue(null);
    prisma.slugRedirect.findFirst.mockResolvedValue(null);

    await expect(repository.isSlugTakenByAnother('wedding-a', 'ana-e-bia', now)).resolves.toBe(
      false,
    );
    expect(prisma.wedding.findFirst).toHaveBeenCalledWith({
      where: { slug: 'ana-e-bia', id: { not: 'wedding-a' } },
      select: { id: true },
    });
    expect(prisma.slugRedirect.findFirst).toHaveBeenCalledWith({
      where: { oldSlug: 'ana-e-bia', expiresAt: { gt: now }, weddingId: { not: 'wedding-a' } },
      select: { id: true },
    });
  });

  it('treats an active redirect of another wedding as taken', async () => {
    prisma.wedding.findFirst.mockResolvedValue(null);
    prisma.slugRedirect.findFirst.mockResolvedValue({ id: 'redirect-1' });

    await expect(repository.isSlugTakenByAnother(null, 'ana-bia', now)).resolves.toBe(true);
  });

  it('lists only wedding ids', async () => {
    prisma.wedding.findMany.mockResolvedValue([{ id: 'wedding-a' }, { id: 'wedding-b' }]);

    await expect(repository.listIds()).resolves.toEqual(['wedding-a', 'wedding-b']);
    expect(prisma.wedding.findMany).toHaveBeenCalledWith({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  });

  describe('anonymization (spec 015)', () => {
    const now = new Date('2027-09-10T05:00:00.000Z');

    it('lists only weddings already held and never the ones already marked (RF01)', async () => {
      prisma.wedding.findMany.mockResolvedValue([]);

      await repository.listNotAnonymizedUntil(now);

      expect(prisma.wedding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personalDataAnonymizedAt: null, weddingDate: { lte: now } },
        }),
      );
    });

    it('marks a wedding only once (RNF03)', async () => {
      await repository.markAnonymized('wedding-a', now);

      expect(prisma.wedding.updateMany).toHaveBeenCalledWith({
        where: { id: 'wedding-a', personalDataAnonymizedAt: null },
        data: { personalDataAnonymizedAt: now },
      });
    });
  });
});
