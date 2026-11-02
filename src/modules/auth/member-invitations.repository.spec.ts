import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { MemberInvitationsRepository } from './member-invitations.repository';

describe('MemberInvitationsRepository', () => {
  const prisma = {
    memberInvitation: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const repository = new MemberInvitationsRepository(prisma as unknown as PrismaService);
  const now = new Date('2027-03-10T12:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.memberInvitation.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('scopes every query by weddingId', async () => {
    await repository.upsert('wedding-a', {
      email: 'bia@example.com',
      role: 'editor',
      tokenHash: 'hash',
      expiresAt: now,
    });
    await repository.list('wedding-a');
    await repository.delete('wedding-a', 'inv-1');
    await repository.consume('wedding-a', 'hash', now, prisma as never);

    expectWeddingScoped(prisma.memberInvitation.upsert, 'wedding-a');
    expectWeddingScoped(prisma.memberInvitation.findMany, 'wedding-a');
    expectWeddingScoped(prisma.memberInvitation.deleteMany, 'wedding-a');
  });

  it('keeps one row per wedding and email, replacing token, role and expiry', async () => {
    await repository.upsert('wedding-a', {
      email: 'bia@example.com',
      role: 'owner',
      tokenHash: 'new',
      expiresAt: now,
    });

    expect(prisma.memberInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { weddingId_email: { weddingId: 'wedding-a', email: 'bia@example.com' } },
        update: { role: 'owner', tokenHash: 'new', expiresAt: now },
      }),
    );
  });

  it('consumes only a valid invitation with that token', async () => {
    await repository.consume('wedding-a', 'hash', now, prisma as never);

    expect(prisma.memberInvitation.deleteMany).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', tokenHash: 'hash', expiresAt: { gt: now } },
    });
  });

  it('finds an invitation by token only while valid', async () => {
    await repository.findValidByTokenHash('hash', now);

    expect(prisma.memberInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: 'hash', expiresAt: { gt: now } } }),
    );
  });
});
