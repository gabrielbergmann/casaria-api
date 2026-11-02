import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { InvitationsRepository } from './invitations.repository';

describe('InvitationsRepository', () => {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn(),
    createManyAndReturn: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  });
  const tx = { invitation: model(), guest: model() };
  const prisma = {
    invitation: model(),
    guest: model(),
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const repository = new InvitationsRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes every read, update and delete of invitations by weddingId', async () => {
    await repository.listPage('wedding-a', 'souza', 0, 50);
    await repository.find('wedding-a', 'inv-of-b');
    await repository.findByToken('wedding-a', 'token-of-b');
    await repository.findByCode('wedding-a', 'CODEOB');
    await repository.listCodes('wedding-a');
    await expect(repository.update('wedding-a', 'inv-of-b', { label: 'x' })).resolves.toBe(false);
    await expect(
      repository.replaceCredentials('wedding-a', 'inv-of-b', 'token', 'ABCDEF'),
    ).resolves.toBe(false);
    await expect(repository.delete('wedding-a', 'inv-of-b')).resolves.toBe(false);

    expectWeddingScoped(prisma.invitation.findMany, 'wedding-a');
    expectWeddingScoped(prisma.invitation.count, 'wedding-a');
    expectWeddingScoped(prisma.invitation.findFirst, 'wedding-a');
    expectWeddingScoped(prisma.invitation.updateMany, 'wedding-a');
    expectWeddingScoped(prisma.invitation.deleteMany, 'wedding-a');
  });

  it('searches the invitation name or the name of one of its people in the same wedding', async () => {
    await repository.listPage('wedding-a', 'souza', 50, 50);

    expect(prisma.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          weddingId: 'wedding-a',
          OR: [
            { label: { contains: 'souza', mode: 'insensitive' } },
            {
              guests: {
                some: { weddingId: 'wedding-a', name: { contains: 'souza', mode: 'insensitive' } },
              },
            },
          ],
        },
        skip: 50,
        take: 50,
      }),
    );
  });

  it('creates the invitation and its people with the weddingId of the guard', async () => {
    await repository.create('wedding-a', {
      label: 'Família Souza',
      maxCompanions: 0,
      token: 'token',
      code: 'ABCDEF',
      guests: [{ name: 'Ana', isChild: false, phone: null, email: null }],
    });

    expectWeddingScoped(prisma.invitation.create, 'wedding-a');
    expect(prisma.invitation.create.mock.calls[0][0].data.guests.create).toEqual([
      { name: 'Ana', isChild: false, phone: null, email: null, weddingId: 'wedding-a' },
    ]);
  });

  it('scopes every query of people by weddingId', async () => {
    await repository.createGuest('wedding-a', 'inv-1', {
      name: 'Ana',
      isChild: false,
      phone: null,
      email: null,
    });
    await repository.findGuest('wedding-a', 'guest-of-b');
    await repository.updateGuest('wedding-a', 'guest-of-b', { name: 'x' });
    await repository.countGuests('wedding-a', 'inv-1');
    await repository.deleteGuest('wedding-a', 'guest-of-b');
    await repository.deleteCompanionsExcept('wedding-a', 'inv-1', ['companion-1']);
    await repository.listPeople('wedding-a');

    expectWeddingScoped(prisma.guest.create, 'wedding-a');
    expectWeddingScoped(prisma.guest.findFirst, 'wedding-a');
    expectWeddingScoped(prisma.guest.updateMany, 'wedding-a');
    expectWeddingScoped(prisma.guest.count, 'wedding-a');
    expectWeddingScoped(prisma.guest.deleteMany, 'wedding-a');
    expectWeddingScoped(prisma.guest.findMany, 'wedding-a');
    expect(prisma.guest.deleteMany).toHaveBeenLastCalledWith({
      where: {
        weddingId: 'wedding-a',
        invitationId: 'inv-1',
        origin: 'COMPANION',
        id: { notIn: ['companion-1'] },
      },
    });
  });

  it('writes the whole import inside one transaction, linking people by token', async () => {
    tx.invitation.createManyAndReturn.mockResolvedValue([
      { id: 'inv-1', token: 't1' },
      { id: 'inv-2', token: 't2' },
    ]);

    await repository.createFromImport('wedding-a', [
      {
        label: 'Família Lima',
        maxCompanions: 1,
        token: 't1',
        code: 'AAAAAA',
        guests: [{ name: 'Ana', isChild: false, phone: null, email: null }],
      },
      {
        label: 'Davi',
        maxCompanions: 0,
        token: 't2',
        code: 'BBBBBB',
        guests: [{ name: 'Davi', isChild: true, phone: null, email: null }],
      },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.invitation.createManyAndReturn).not.toHaveBeenCalled();
    expect(prisma.guest.createMany).not.toHaveBeenCalled();
    expect(tx.invitation.createManyAndReturn.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ weddingId: 'wedding-a', token: 't1', code: 'AAAAAA' }),
      expect.objectContaining({ weddingId: 'wedding-a', token: 't2', code: 'BBBBBB' }),
    ]);
    expect(tx.guest.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ name: 'Ana', invitationId: 'inv-1', weddingId: 'wedding-a' }),
      expect.objectContaining({ name: 'Davi', invitationId: 'inv-2', weddingId: 'wedding-a' }),
    ]);
  });
});
