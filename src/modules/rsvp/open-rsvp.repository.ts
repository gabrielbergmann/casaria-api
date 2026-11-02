import { Injectable } from '@nestjs/common';
import type { RsvpStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface NewOpenResponse {
  name: string;
  phone: string | null;
  email: string | null;
  status: RsvpStatus;
  message: string | null;
}

export interface OpenResponseRecord extends NewOpenResponse {
  id: string;
  createdAt: Date;
}

const RECORD = {
  id: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  message: true,
  createdAt: true,
} as const;

export const ANONYMIZED_VISITOR_NAME = 'Visitante anonimizado';

// Respostas de visitantes do modo aberto (spec 010 RF09), separadas dos convites.
@Injectable()
export class OpenRsvpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(weddingId: string, response: NewOpenResponse): Promise<void> {
    await this.prisma.openRsvpResponse.create({ data: { ...response, weddingId } });
  }

  /** Mais recentes primeiro. */
  async listPage(
    weddingId: string,
    skip: number,
    take: number,
  ): Promise<{ items: OpenResponseRecord[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.openRsvpResponse.findMany({
        where: { weddingId },
        select: RECORD,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.openRsvpResponse.count({ where: { weddingId } }),
    ]);
    return { items, total };
  }

  listAll(weddingId: string): Promise<OpenResponseRecord[]> {
    return this.prisma.openRsvpResponse.findMany({
      where: { weddingId },
      select: RECORD,
      orderBy: { id: 'asc' },
    });
  }

  /** Anonimização (spec 015): nome trocado e contato nulo; status e mensagem ficam. */
  async anonymize(weddingId: string): Promise<void> {
    await this.prisma.openRsvpResponse.updateMany({
      where: { weddingId },
      data: { name: ANONYMIZED_VISITOR_NAME, phone: null, email: null },
    });
  }

  async delete(weddingId: string, responseId: string): Promise<boolean> {
    const { count } = await this.prisma.openRsvpResponse.deleteMany({
      where: { id: responseId, weddingId },
    });
    return count > 0;
  }

  /** Visitantes por presença, contados no banco (RF11). */
  async countByStatus(weddingId: string): Promise<Partial<Record<RsvpStatus, number>>> {
    const groups = await this.prisma.openRsvpResponse.groupBy({
      by: ['status'],
      where: { weddingId },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }
}
