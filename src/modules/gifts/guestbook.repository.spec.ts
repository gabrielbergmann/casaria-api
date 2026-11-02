import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { GuestbookRepository } from './guestbook.repository';

describe('GuestbookRepository', () => {
  const prisma = {
    guestbookMessage: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateManyAndReturn: jest.fn().mockResolvedValue([]),
    },
  };
  const repository = new GuestbookRepository(prisma as unknown as PrismaService);
  const model = prisma.guestbookMessage;

  beforeEach(() => jest.clearAllMocks());

  it('scopes every query of messages by weddingId (RNF01)', async () => {
    await repository.create('wedding-a', { authorName: 'Davi', body: 'Oi' });
    await repository.listPage('wedding-a', 'APPROVED', undefined, 50);
    await repository.countPending('wedding-a');
    await expect(repository.setStatus('wedding-a', 'message-of-b', 'APPROVED')).resolves.toBeNull();

    for (const method of [model.create, model.findMany, model.count, model.updateManyAndReturn]) {
      expectWeddingScoped(method, 'wedding-a');
    }
  });

  it('creates without a status, so the database default PENDING applies (RF02)', async () => {
    await repository.create('wedding-a', { authorName: 'Davi', body: 'Oi' });

    expect(model.create.mock.calls[0][0].data).toEqual({
      authorName: 'Davi',
      body: 'Oi',
      weddingId: 'wedding-a',
    });
  });

  it('filters by status, newest first, one extra row and continues after the cursor', async () => {
    await repository.listPage('wedding-a', 'APPROVED', 'cursor-id', 50);

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { weddingId: 'wedding-a', status: 'APPROVED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        cursor: { id: 'cursor-id' },
        skip: 1,
        take: 51,
      }),
    );
  });

  it('counts only pending messages', async () => {
    await repository.countPending('wedding-a');

    expect(model.count).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', status: 'PENDING' },
    });
  });
});
