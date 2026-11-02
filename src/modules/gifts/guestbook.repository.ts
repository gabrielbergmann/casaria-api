import { Injectable } from '@nestjs/common';
import type { GuestbookStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface GuestbookMessageRecord {
  id: string;
  authorName: string;
  body: string;
  status: GuestbookStatus;
  createdAt: Date;
  updatedAt: Date;
}

const RECORD = {
  id: true,
  authorName: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Recados do mural (spec 013); weddingId explícito em toda consulta (RNF01).
@Injectable()
export class GuestbookRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Sempre PENDING: o status vem do padrão do banco (RF02). */
  create(
    weddingId: string,
    message: { authorName: string; body: string },
  ): Promise<GuestbookMessageRecord> {
    return this.prisma.guestbookMessage.create({
      data: { ...message, weddingId },
      select: RECORD,
    });
  }

  /** Mais recentes primeiro; `take` + 1 itens para saber se há próxima página. */
  listPage(
    weddingId: string,
    status: GuestbookStatus,
    cursor: string | undefined,
    take: number,
  ): Promise<GuestbookMessageRecord[]> {
    return this.prisma.guestbookMessage.findMany({
      where: { weddingId, status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
      select: RECORD,
    });
  }

  countPending(weddingId: string): Promise<number> {
    return this.prisma.guestbookMessage.count({ where: { weddingId, status: 'PENDING' } });
  }

  /** Null quando o recado não é deste casamento (RNF01). */
  async setStatus(
    weddingId: string,
    messageId: string,
    status: GuestbookStatus,
  ): Promise<GuestbookMessageRecord | null> {
    const [message] = await this.prisma.guestbookMessage.updateManyAndReturn({
      where: { id: messageId, weddingId },
      data: { status },
      select: RECORD,
    });
    return message ?? null;
  }
}
