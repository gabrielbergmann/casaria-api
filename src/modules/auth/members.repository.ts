import { Injectable } from '@nestjs/common';
import type { WeddingRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';

export type RemoveMemberResult = 'removed' | 'not_found' | 'last_owner';

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Papel do usuário no casamento; um único vínculo por (casamento, usuário). */
  async findRole(weddingId: string, userId: string): Promise<WeddingRole | null> {
    const member = await this.prisma.weddingMember.findUnique({
      where: { weddingId_userId: { weddingId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async existsByEmail(weddingId: string, email: string): Promise<boolean> {
    const member = await this.prisma.weddingMember.findFirst({
      where: { weddingId, user: { email } },
      select: { id: true },
    });
    return member !== null;
  }

  /** Vínculos de um usuário: consulta de resolução, sem weddingId do contexto (spec 003 RF13). */
  listByUser(userId: string): Promise<{ weddingId: string; role: WeddingRole }[]> {
    return this.prisma.weddingMember.findMany({
      where: { userId },
      select: { weddingId: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  list(weddingId: string) {
    return this.prisma.weddingMember.findMany({
      where: { weddingId },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(weddingId: string, userId: string, role: WeddingRole, db: Tx): Promise<void> {
    await db.weddingMember.create({ data: { weddingId, userId, role } });
  }

  /**
   * Remove o vínculo sem zerar os owners: a linha do casamento fica bloqueada durante a contagem,
   * então duas remoções simultâneas não apagam os dois últimos (spec 005 RF09).
   */
  removeMember(weddingId: string, memberId: string): Promise<RemoveMemberResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM weddings WHERE id = ${weddingId}::uuid FOR UPDATE`;
      const member = await tx.weddingMember.findFirst({
        where: { id: memberId, weddingId },
        select: { role: true },
      });
      if (!member) return 'not_found';
      if (member.role === 'owner') {
        const owners = await tx.weddingMember.count({ where: { weddingId, role: 'owner' } });
        if (owners <= 1) return 'last_owner';
      }
      await tx.weddingMember.delete({ where: { id: memberId, weddingId } });
      return 'removed';
    });
  }
}
