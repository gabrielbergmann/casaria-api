import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { MediaRepository } from './media.repository';

describe('MediaRepository', () => {
  const prisma = {
    media: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const repository = new MediaRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('creates the record with the weddingId of the guard', async () => {
    await repository.create('wedding-a', {
      contentType: 'image/jpeg',
      byteSize: 10,
      width: 1,
      height: 1,
    });

    expectWeddingScoped(prisma.media.create, 'wedding-a');
  });

  it('scopes lookup, page, resolution and deletion by weddingId', async () => {
    prisma.media.findFirst.mockResolvedValue(null);
    prisma.media.findMany.mockResolvedValue([]);

    await expect(repository.exists('wedding-a', 'media-of-b')).resolves.toBe(false);
    await repository.listPage('wedding-a', undefined, 50);
    await repository.findMany('wedding-a', ['media-1', 'media-of-b']);
    await repository.delete('wedding-a', 'media-of-b');

    expectWeddingScoped(prisma.media.findFirst, 'wedding-a');
    expectWeddingScoped(prisma.media.findMany, 'wedding-a');
    expectWeddingScoped(prisma.media.deleteMany, 'wedding-a');
    expect(prisma.media.deleteMany).toHaveBeenCalledWith({
      where: { id: 'media-of-b', weddingId: 'wedding-a' },
    });
  });

  it('pages from the newest, asking one extra item to know about the next page', async () => {
    prisma.media.findMany.mockResolvedValue([]);

    await repository.listPage('wedding-a', 'cursor-id', 50);

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { weddingId: 'wedding-a', id: { lt: 'cursor-id' } },
        orderBy: { id: 'desc' },
        take: 51,
      }),
    );
  });
});
