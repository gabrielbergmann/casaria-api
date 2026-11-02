import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

// Texto do convite do casamento (spec 009 RF13); sem linha, vale o padrão do service.
@Injectable()
export class GuestSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findInviteMessage(weddingId: string): Promise<string | null> {
    const row = await this.prisma.guestSettings.findUnique({
      where: { weddingId },
      select: { inviteMessage: true },
    });
    return row?.inviteMessage ?? null;
  }

  async saveInviteMessage(weddingId: string, inviteMessage: string): Promise<void> {
    await this.prisma.guestSettings.upsert({
      where: { weddingId },
      create: { weddingId, inviteMessage },
      update: { inviteMessage },
    });
  }
}
