import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { GiftCategoriesRepository } from './gift-categories.repository';

describe('GiftCategoriesRepository', () => {
  const giftCategory = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const gift = { updateMany: jest.fn().mockResolvedValue({ count: 2 }) };
  const prisma = {
    giftCategory,
    gift,
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const repository = new GiftCategoriesRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes every read and write by weddingId (RNF01)', async () => {
    await repository.list('wedding-a');
    await repository.listWithActiveGifts('wedding-a');
    await repository.exists('wedding-a', 'category-of-b');
    await repository.create('wedding-a', 'Casa');
    await repository.rename('wedding-a', 'category-of-b', 'Cozinha');
    await repository.delete('wedding-a', 'category-of-b');

    expectWeddingScoped(giftCategory.findMany, 'wedding-a');
    expectWeddingScoped(giftCategory.count, 'wedding-a');
    expectWeddingScoped(giftCategory.create, 'wedding-a');
    expectWeddingScoped(giftCategory.updateMany, 'wedding-a');
    expectWeddingScoped(giftCategory.deleteMany, 'wedding-a');
    expectWeddingScoped(gift.updateMany, 'wedding-a');
  });

  it('lists for the showcase only categories with an active gift of the same wedding', async () => {
    await repository.listWithActiveGifts('wedding-a');

    expect(giftCategory.findMany.mock.calls[0][0].where).toEqual({
      weddingId: 'wedding-a',
      gifts: { some: { weddingId: 'wedding-a', deletedAt: null } },
    });
  });

  it('leaves the gifts of a deleted category without category, in the same transaction (RF07)', async () => {
    await expect(repository.delete('wedding-a', 'category-1')).resolves.toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(gift.updateMany).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', categoryId: 'category-1' },
      data: { categoryId: null },
    });
  });
});
