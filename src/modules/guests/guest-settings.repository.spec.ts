import type { PrismaService } from '../../infra/prisma/prisma.service';
import { GuestSettingsRepository } from './guest-settings.repository';

describe('GuestSettingsRepository', () => {
  const prisma = { guestSettings: { findUnique: jest.fn(), upsert: jest.fn() } };
  const repository = new GuestSettingsRepository(prisma as unknown as PrismaService);

  it('reads and writes only the row of the wedding', async () => {
    prisma.guestSettings.findUnique.mockResolvedValue(null);

    await expect(repository.findInviteMessage('wedding-a')).resolves.toBeNull();
    await repository.saveInviteMessage('wedding-a', 'Olá');

    expect(prisma.guestSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { weddingId: 'wedding-a' } }),
    );
    expect(prisma.guestSettings.upsert).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a' },
      create: { weddingId: 'wedding-a', inviteMessage: 'Olá' },
      update: { inviteMessage: 'Olá' },
    });
  });
});
