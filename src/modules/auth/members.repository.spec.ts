import { expectWeddingScoped } from '../../common/testing/wedding-scope';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { MembersRepository } from './members.repository';

describe('MembersRepository', () => {
  const tx = {
    $queryRaw: jest.fn(),
    weddingMember: { findFirst: jest.fn(), count: jest.fn(), delete: jest.fn() },
  };
  const prisma = {
    weddingMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const repository = new MembersRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('scopes the role lookup by weddingId and userId', async () => {
    prisma.weddingMember.findUnique.mockResolvedValue({ role: 'editor' });

    await expect(repository.findRole('wedding-a', 'user-1')).resolves.toBe('editor');
    expectWeddingScoped(prisma.weddingMember.findUnique, 'wedding-a');
  });

  it('scopes list, lookup by email and creation by weddingId', async () => {
    prisma.weddingMember.findFirst.mockResolvedValue(null);

    await repository.list('wedding-a');
    await repository.existsByEmail('wedding-a', 'bia@example.com');
    await repository.create('wedding-a', 'user-1', 'editor', prisma as never);

    expectWeddingScoped(prisma.weddingMember.findMany, 'wedding-a');
    expectWeddingScoped(prisma.weddingMember.findFirst, 'wedding-a');
    expectWeddingScoped(prisma.weddingMember.create, 'wedding-a');
  });

  describe('removeMember', () => {
    it('locks the wedding row before counting owners', async () => {
      tx.weddingMember.findFirst.mockResolvedValue({ role: 'owner' });
      tx.weddingMember.count.mockResolvedValue(2);

      await expect(repository.removeMember('wedding-a', 'member-1')).resolves.toBe('removed');
      const [sql] = tx.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(tx.weddingMember.count).toHaveBeenCalledWith({
        where: { weddingId: 'wedding-a', role: 'owner' },
      });
      expect(tx.weddingMember.delete).toHaveBeenCalledWith({
        where: { id: 'member-1', weddingId: 'wedding-a' },
      });
    });

    it('refuses to remove the last owner', async () => {
      tx.weddingMember.findFirst.mockResolvedValue({ role: 'owner' });
      tx.weddingMember.count.mockResolvedValue(1);

      await expect(repository.removeMember('wedding-a', 'member-1')).resolves.toBe('last_owner');
      expect(tx.weddingMember.delete).not.toHaveBeenCalled();
    });

    it('removes an editor without counting owners', async () => {
      tx.weddingMember.findFirst.mockResolvedValue({ role: 'editor' });

      await expect(repository.removeMember('wedding-a', 'member-2')).resolves.toBe('removed');
      expect(tx.weddingMember.count).not.toHaveBeenCalled();
    });

    it('does not find a member of another wedding', async () => {
      tx.weddingMember.findFirst.mockResolvedValue(null);

      await expect(repository.removeMember('wedding-a', 'member-of-b')).resolves.toBe('not_found');
      expect(tx.weddingMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'member-of-b', weddingId: 'wedding-a' } }),
      );
    });
  });
});
