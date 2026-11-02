import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { OpenRsvpRepository } from './open-rsvp.repository';

describe('OpenRsvpRepository', () => {
  const prisma = {
    openRsvpResponse: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const repository = new OpenRsvpRepository(prisma as unknown as PrismaService);

  it('scopes every query of visitors by weddingId', async () => {
    await repository.create('wedding-a', {
      name: 'Davi',
      phone: null,
      email: 'davi@example.com',
      status: 'CONFIRMED',
      message: null,
    });
    await repository.listPage('wedding-a', 0, 50);
    await repository.listAll('wedding-a');
    await expect(repository.delete('wedding-a', 'visitor-of-b')).resolves.toBe(false);
    await repository.countByStatus('wedding-a');

    const model = prisma.openRsvpResponse;
    for (const method of [
      model.create,
      model.findMany,
      model.count,
      model.deleteMany,
      model.groupBy,
    ]) {
      expectWeddingScoped(method, 'wedding-a');
    }
  });
});
