import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { type GiftData, GiftsRepository } from './gifts.repository';

const data: GiftData = {
  type: 'QUOTA',
  title: 'Lua de mel',
  description: null,
  mediaId: null,
  categoryId: null,
  priceCents: null,
  quotaPriceCents: 15_000,
  quotaTotal: 4,
  hideWhenSoldOut: false,
};

describe('GiftsRepository', () => {
  const gift = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _max: { position: 3 } }),
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    gift,
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const repository = new GiftsRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes every read and write by weddingId and skips deleted gifts (RNF01)', async () => {
    await repository.listActive('wedding-a');
    await repository.findActive('wedding-a', 'gift-of-b');
    await repository.create('wedding-a', data);
    await expect(repository.softDelete('wedding-a', 'gift-of-b', new Date())).resolves.toBe(false);
    await repository.reorder('wedding-a', ['gift-1', 'gift-2']);
    await repository.usesMedia('wedding-a', 'media-1');

    for (const mock of [gift.findMany, gift.findFirst, gift.updateMany, gift.count]) {
      expectWeddingScoped(mock, 'wedding-a');
      for (const [args] of mock.mock.calls) expect(args.where.deletedAt).toBeNull();
    }
    expectWeddingScoped(gift.aggregate, 'wedding-a');
    expectWeddingScoped(gift.create, 'wedding-a');
  });

  it('lists in catalog order', async () => {
    await repository.listActive('wedding-a');

    expect(gift.findMany.mock.calls[0][0].orderBy).toEqual([{ position: 'asc' }, { id: 'asc' }]);
  });

  it('puts a new gift after the last position of the wedding (RF04)', async () => {
    await repository.create('wedding-a', data);

    expect(gift.create.mock.calls[0][0].data.position).toBe(4);
  });

  it('starts the catalog at position 1', async () => {
    gift.aggregate.mockResolvedValueOnce({ _max: { position: null } });

    await repository.create('wedding-a', data);

    expect(gift.create.mock.calls[0][0].data.position).toBe(1);
  });

  it('never writes the quota counters on create or update (RF10)', async () => {
    await repository.create('wedding-a', data);
    await repository.update('wedding-a', 'gift-1', data);

    const created = Object.keys(gift.create.mock.calls[0][0].data);
    expect(created).not.toContain('quotasSold');
    expect(created).not.toContain('quotasReserved');
    const [sql] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    const setClause = sql.join('?').split('WHERE')[0];
    expect(setClause).not.toMatch(/quotas_(sold|reserved)/);
  });

  it('updates with a conditional UPDATE scoped by wedding, gift and active row', async () => {
    prisma.$executeRaw.mockResolvedValueOnce(1);

    await expect(repository.update('wedding-a', 'gift-1', data)).resolves.toBe(true);

    const [sql, ...values] = prisma.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const text = sql.join('?');
    expect(text).toContain('wedding_id = ?::uuid');
    expect(text).toContain('deleted_at IS NULL');
    expect(text).toContain('quotas_sold + quotas_reserved <= COALESCE(?::int, 0)');
    expect(values).toContain('wedding-a');
    expect(values).toContain('gift-1');
  });

  it('reports a locked or missing gift when the conditional update touches no row', async () => {
    await expect(repository.update('wedding-a', 'gift-1', data)).resolves.toBe(false);
  });

  it('writes positions 1..n in the received order inside one transaction', async () => {
    await repository.reorder('wedding-a', ['gift-2', 'gift-1']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(gift.updateMany.mock.calls.map(([args]) => [args.where.id, args.data])).toEqual([
      ['gift-2', { position: 1 }],
      ['gift-1', { position: 2 }],
    ]);
  });
});

describe('GiftsRepository quota counters (spec 012)', () => {
  const executeRaw = jest.fn().mockResolvedValue(1);
  const tx = { $executeRaw: executeRaw } as never;
  const gift = { findMany: jest.fn().mockResolvedValue([]) };
  const repository = new GiftsRepository({ gift } as unknown as PrismaService);
  const sqlOf = (call: number) => {
    const [sql, ...values] = executeRaw.mock.calls[call] as [TemplateStringsArray, ...unknown[]];
    return { text: sql.join('?'), values };
  };

  beforeEach(() => jest.clearAllMocks());

  it('reserves only if sold + reserved + quantity fit the total, in the caller transaction', async () => {
    await expect(repository.reserveQuotas('wedding-a', 'gift-1', 2, tx)).resolves.toBe(true);

    const { text, values } = sqlOf(0);
    expect(text).toContain('quotas_reserved = quotas_reserved + ?::int');
    expect(text).toContain('quotas_sold + quotas_reserved + ?::int <= quota_total');
    expect(text).toContain('wedding_id = ?::uuid');
    expect(text).toContain('deleted_at IS NULL');
    expect(values).toEqual([2, 'gift-1', 'wedding-a', 2]);
  });

  it('reports a sold out gift when the conditional update touches no row (RF08 of 012)', async () => {
    executeRaw.mockResolvedValueOnce(0);

    await expect(repository.reserveQuotas('wedding-a', 'gift-1', 1, tx)).resolves.toBe(false);
  });

  it('confirms and releases with guards against negative counters, scoped by wedding', async () => {
    await repository.confirmQuotas('wedding-a', 'gift-1', 2, tx);
    await repository.releaseReservedQuotas('wedding-a', 'gift-1', 2, tx);
    await repository.releaseSoldQuotas('wedding-a', 'gift-1', 2, tx);

    expect(sqlOf(0).text).toContain('AND quotas_reserved >= ?::int');
    expect(sqlOf(0).text).toContain('quotas_sold = quotas_sold + ?::int');
    expect(sqlOf(1).text).toContain('quotas_reserved = quotas_reserved - ?::int');
    expect(sqlOf(2).text).toContain('AND quotas_sold >= ?::int');
    for (const call of [0, 1, 2]) {
      expect(sqlOf(call).text).toContain('wedding_id = ?::uuid');
      expect(sqlOf(call).values).toContain('wedding-a');
    }
  });

  it('reads titles of the wedding, deleted gifts included', async () => {
    await repository.findTitles('wedding-a', ['gift-1']);

    expect(gift.findMany).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', id: { in: ['gift-1'] } },
      select: { id: true, title: true },
    });
  });
});
