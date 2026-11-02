import { Injectable } from '@nestjs/common';
import type { WeddingRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';

const INVITATION = { id: true, email: true, role: true, expiresAt: true } as const;

@Injectable()
export class MemberInvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma linha por (casamento, email): convidar de novo troca token, papel e validade. */
  upsert(
    weddingId: string,
    invite: { email: string; role: WeddingRole; tokenHash: string; expiresAt: Date },
    db: Tx = this.prisma,
  ) {
    const { email, ...changes } = invite;
    return db.memberInvitation.upsert({
      where: { weddingId_email: { weddingId, email } },
      create: { weddingId, email, ...changes },
      update: changes,
      select: INVITATION,
    });
  }

  list(weddingId: string) {
    return this.prisma.memberInvitation.findMany({
      where: { weddingId },
      select: INVITATION,
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(weddingId: string, invitationId: string): Promise<boolean> {
    const { count } = await this.prisma.memberInvitation.deleteMany({
      where: { id: invitationId, weddingId },
    });
    return count === 1;
  }

  /** Convite pelo hash do token: consulta de resolução (spec 003 RF13), só se vigente. */
  findValidByTokenHash(tokenHash: string, now: Date) {
    return this.prisma.memberInvitation.findFirst({
      where: { tokenHash, expiresAt: { gt: now } },
      select: {
        weddingId: true,
        email: true,
        role: true,
        wedding: { select: { coupleName: true } },
      },
    });
  }

  /** Consome o convite condicionado ao hash e à validade: só um aceite simultâneo vence. */
  async consume(weddingId: string, tokenHash: string, now: Date, db: Tx): Promise<boolean> {
    const { count } = await db.memberInvitation.deleteMany({
      where: { weddingId, tokenHash, expiresAt: { gt: now } },
    });
    return count === 1;
  }
}
