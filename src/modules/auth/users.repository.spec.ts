import type { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  const prisma = { user: { update: jest.fn(), updateMany: jest.fn() } };
  const repository = new UsersRepository(prisma as unknown as PrismaService);
  const now = new Date('2027-03-10T12:00:00Z');

  beforeEach(() => jest.resetAllMocks());

  it('bumps the session version and drops any pending reset link when a password is set', async () => {
    prisma.user.update.mockResolvedValue({ sessionVersion: 2 });

    await expect(repository.setPassword('user-1', 'bcrypt-hash')).resolves.toBe(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        passwordHash: 'bcrypt-hash',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
  });

  it('consumes a reset link only while valid, in a single conditional write', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.resetPasswordByToken('token-hash', 'bcrypt-hash', now)).resolves.toBe(
      true,
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { passwordResetTokenHash: 'token-hash', passwordResetExpiresAt: { gt: now } },
      data: {
        passwordHash: 'bcrypt-hash',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
  });

  it('reports a reused link as not consumed', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.resetPasswordByToken('token-hash', 'bcrypt-hash', now)).resolves.toBe(
      false,
    );
  });
});
