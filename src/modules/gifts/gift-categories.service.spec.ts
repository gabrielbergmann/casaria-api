import { Prisma } from '../../generated/prisma/client';
import { GiftCategoryNameTaken, GiftCategoryNotFound } from './errors/gift-errors';
import type { GiftCategoriesRepository } from './gift-categories.repository';
import { GiftCategoriesService } from './gift-categories.service';

const CATEGORY = '01890000-0000-7000-8000-0000000000f1';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });

describe('GiftCategoriesService', () => {
  const repository = {
    list: jest.fn(),
    create: jest.fn(),
    rename: jest.fn(),
    delete: jest.fn(),
  };
  const service = new GiftCategoriesService(repository as unknown as GiftCategoriesRepository);

  beforeEach(() => jest.clearAllMocks());

  it('refuses a name already used in the wedding (RF07)', async () => {
    repository.create.mockRejectedValueOnce(uniqueViolation());
    repository.rename.mockRejectedValueOnce(uniqueViolation());

    await expect(service.create('wedding-a', 'Casa')).rejects.toBeInstanceOf(GiftCategoryNameTaken);
    await expect(service.rename('wedding-a', CATEGORY, 'Casa')).rejects.toBeInstanceOf(
      GiftCategoryNameTaken,
    );
  });

  it('renames a category of the wedding', async () => {
    repository.rename.mockResolvedValueOnce(true);

    await expect(service.rename('wedding-a', CATEGORY, 'Cozinha')).resolves.toEqual({
      id: CATEGORY,
      name: 'Cozinha',
    });
  });

  it('does not find a category of another wedding or an invalid id', async () => {
    repository.rename.mockResolvedValue(false);
    repository.delete.mockResolvedValue(false);

    await expect(service.rename('wedding-a', CATEGORY, 'x')).rejects.toBeInstanceOf(
      GiftCategoryNotFound,
    );
    await expect(service.delete('wedding-a', CATEGORY)).rejects.toBeInstanceOf(
      GiftCategoryNotFound,
    );
    await expect(service.delete('wedding-a', 'abc')).rejects.toBeInstanceOf(GiftCategoryNotFound);
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });
});
