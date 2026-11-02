import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { RsvpStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';
import type { DietaryNotesChange } from './answers';

export interface RsvpSettingsRecord {
  openModeEnabled: boolean;
  deadline: Date | null;
}

export interface ResponseRecord {
  guestId: string;
  status: RsvpStatus;
  dietaryNotes: string | null;
  message: string | null;
}

export interface AnswerToSave {
  guestId: string;
  status: RsvpStatus;
  dietaryNotes?: DietaryNotesChange;
  message: string | null;
}

/** Pendente = pessoa sem resposta. */
export type PersonStatus = RsvpStatus | 'PENDING';

export interface PersonRecord {
  guestId: string;
  invitationLabel: string;
  name: string;
  isChild: boolean;
  origin: 'LIST' | 'COMPANION';
  phone: string | null;
  email: string | null;
  status: PersonStatus;
  dietaryNotes: string | null;
  message: string | null;
  respondedAt: Date | null;
}

export interface AgeStatusCount {
  isChild: boolean;
  status: RsvpStatus | null;
  count: number;
}

const PERSON = {
  id: true,
  name: true,
  isChild: true,
  origin: true,
  phone: true,
  email: true,
  invitation: { select: { label: true } },
  rsvp: { select: { status: true, dietaryNotes: true, message: true, respondedAt: true } },
} as const;

type PersonRow = {
  id: string;
  name: string;
  isChild: boolean;
  origin: 'LIST' | 'COMPANION';
  phone: string | null;
  email: string | null;
  invitation: { label: string };
  rsvp: {
    status: RsvpStatus;
    dietaryNotes: string | null;
    message: string | null;
    respondedAt: Date;
  } | null;
};

const toPerson = (row: PersonRow): PersonRecord => ({
  guestId: row.id,
  invitationLabel: row.invitation.label,
  name: row.name,
  isChild: row.isChild,
  origin: row.origin,
  phone: row.phone,
  email: row.email,
  status: row.rsvp?.status ?? 'PENDING',
  dietaryNotes: row.rsvp?.dietaryNotes ?? null,
  message: row.rsvp?.message ?? null,
  respondedAt: row.rsvp?.respondedAt ?? null,
});

function statusFilter(status: PersonStatus | undefined): Prisma.GuestWhereInput {
  if (status === undefined) return {};
  return status === 'PENDING' ? { rsvp: { is: null } } : { rsvp: { is: { status } } };
}

// Configuração e respostas dos convites (spec 010). Todo método filtra por weddingId (RNF03).
@Injectable()
export class RsvpRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Anonimização (spec 015): só a restrição alimentar sai; status e mensagens ficam. */
  async anonymizeDietaryNotes(weddingId: string): Promise<void> {
    await this.prisma.rsvpResponse.updateMany({
      where: { weddingId },
      data: { dietaryNotes: null },
    });
  }

  findSettings(weddingId: string): Promise<RsvpSettingsRecord | null> {
    return this.prisma.rsvpSettings.findUnique({
      where: { weddingId },
      select: { openModeEnabled: true, deadline: true },
    });
  }

  async saveSettings(weddingId: string, settings: RsvpSettingsRecord): Promise<void> {
    await this.prisma.rsvpSettings.upsert({
      where: { weddingId },
      create: { weddingId, ...settings },
      update: settings,
    });
  }

  findResponses(weddingId: string, guestIds: string[]): Promise<ResponseRecord[]> {
    return this.prisma.rsvpResponse.findMany({
      where: { weddingId, guestId: { in: guestIds } },
      select: { guestId: true, status: true, dietaryNotes: true, message: true },
    });
  }

  /** Substitui a resposta de cada pessoa; restrição ausente mantém a gravada (ADR-002). */
  async saveAnswers(
    weddingId: string,
    answers: AnswerToSave[],
    respondedAt: Date,
    db: Tx,
  ): Promise<void> {
    for (const { guestId, status, dietaryNotes, message } of answers) {
      await db.rsvpResponse.upsert({
        where: { guestId, weddingId },
        create: {
          weddingId,
          guestId,
          status,
          message,
          dietaryNotes: dietaryNotes ?? null,
          respondedAt,
        },
        update: { status, message, respondedAt, dietaryNotes },
      });
    }
  }

  /** Pessoas por idade e presença numa consulta (RF11); status nulo = pendente. */
  async countByAgeAndStatus(weddingId: string): Promise<AgeStatusCount[]> {
    const rows = await this.prisma.$queryRaw<
      { is_child: boolean; status: RsvpStatus | null; count: number }[]
    >`
      SELECT g.is_child, r.status, count(*)::int AS count
        FROM guests g
        LEFT JOIN rsvp_responses r ON r.guest_id = g.id AND r.wedding_id = g.wedding_id
       WHERE g.wedding_id = ${weddingId}::uuid
       GROUP BY g.is_child, r.status`;
    return rows.map((row) => ({ isChild: row.is_child, status: row.status, count: row.count }));
  }

  /** Respostas por pessoa, com a restrição (só painel, RF12 e RF13), por convite. */
  async listPeople(
    weddingId: string,
    status: PersonStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: PersonRecord[]; total: number }> {
    const where = { weddingId, ...statusFilter(status) };
    const [rows, total] = await Promise.all([
      this.prisma.guest.findMany({
        where,
        select: PERSON,
        orderBy: [{ invitation: { label: 'asc' } }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.guest.count({ where }),
    ]);
    return { items: rows.map(toPerson), total };
  }

  /** Todas as pessoas para a exportação, sem paginar. */
  async listAllPeople(weddingId: string): Promise<PersonRecord[]> {
    const rows = await this.prisma.guest.findMany({
      where: { weddingId },
      select: PERSON,
      orderBy: [{ invitation: { label: 'asc' } }, { id: 'asc' }],
    });
    return rows.map(toPerson);
  }
}
