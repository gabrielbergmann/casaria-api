import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';
import { RsvpRepository } from './rsvp.repository';

describe('RsvpRepository', () => {
  const prisma = {
    rsvpSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    rsvpResponse: { findMany: jest.fn(), upsert: jest.fn() },
    guest: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const repository = new RsvpRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes settings, responses and people by weddingId', async () => {
    await repository.findSettings('wedding-a');
    await repository.saveSettings('wedding-a', { openModeEnabled: true, deadline: null });
    await repository.findResponses('wedding-a', ['guest-of-b']);
    await repository.listPeople('wedding-a', 'PENDING', 0, 50);
    await repository.listAllPeople('wedding-a');

    expectWeddingScoped(prisma.rsvpSettings.findUnique, 'wedding-a');
    expectWeddingScoped(prisma.rsvpSettings.upsert, 'wedding-a');
    expectWeddingScoped(prisma.rsvpResponse.findMany, 'wedding-a');
    expectWeddingScoped(prisma.guest.findMany, 'wedding-a');
    expectWeddingScoped(prisma.guest.count, 'wedding-a');
  });

  it('filters pending people as those without a response', async () => {
    await repository.listPeople('wedding-a', 'PENDING', 0, 50);
    await repository.listPeople('wedding-a', 'CONFIRMED', 0, 50);

    expect(prisma.guest.count).toHaveBeenNthCalledWith(1, {
      where: { weddingId: 'wedding-a', rsvp: { is: null } },
    });
    expect(prisma.guest.count).toHaveBeenNthCalledWith(2, {
      where: { weddingId: 'wedding-a', rsvp: { is: { status: 'CONFIRMED' } } },
    });
  });

  it('writes each answer inside the transaction with the weddingId, keeping omitted notes', async () => {
    const tx = { rsvpResponse: { upsert: jest.fn() } };
    const at = new Date('2027-02-01T12:00:00.000Z');

    await repository.saveAnswers(
      'wedding-a',
      [
        { guestId: 'g1', status: 'CONFIRMED', message: null },
        { guestId: 'g2', status: 'DECLINED', dietaryNotes: null, message: 'Que pena' },
      ],
      at,
      tx as unknown as Tx,
    );

    expect(prisma.rsvpResponse.upsert).not.toHaveBeenCalled();
    expectWeddingScoped(tx.rsvpResponse.upsert, 'wedding-a');
    expect(tx.rsvpResponse.upsert.mock.calls[0][0]).toEqual({
      where: { guestId: 'g1', weddingId: 'wedding-a' },
      create: {
        weddingId: 'wedding-a',
        guestId: 'g1',
        status: 'CONFIRMED',
        message: null,
        dietaryNotes: null,
        respondedAt: at,
      },
      update: { status: 'CONFIRMED', message: null, respondedAt: at, dietaryNotes: undefined },
    });
    expect(tx.rsvpResponse.upsert.mock.calls[1][0].update.dietaryNotes).toBeNull();
  });

  it('counts people by age and presence in SQL filtered by the wedding', async () => {
    prisma.$queryRaw.mockResolvedValue([{ is_child: true, status: null, count: 2 }]);

    await expect(repository.countByAgeAndStatus('wedding-a')).resolves.toEqual([
      { isChild: true, status: null, count: 2 },
    ]);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('WHERE g.wedding_id = ?::uuid');
    expect(values).toEqual(['wedding-a']);
  });
});
