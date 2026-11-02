import { Injectable } from '@nestjs/common';
import type { GuestOrigin } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';
import type { ExistingPerson, ImportedInvitation } from './import-rows';

export interface GuestRecord {
  id: string;
  invitationId: string;
  name: string;
  isChild: boolean;
  phone: string | null;
  email: string | null;
  origin: GuestOrigin;
}

export interface InvitationRecord {
  id: string;
  label: string;
  maxCompanions: number;
  token: string;
  code: string;
  guests: GuestRecord[];
}

export interface GuestData {
  name: string;
  isChild: boolean;
  phone: string | null;
  email: string | null;
}

export interface NewInvitation {
  label: string;
  maxCompanions: number;
  token: string;
  code: string;
  guests: GuestData[];
}

export type GuestChanges = Partial<GuestData>;
export type InvitationChanges = Partial<Pick<NewInvitation, 'label' | 'maxCompanions'>>;

const GUEST = {
  id: true,
  invitationId: true,
  name: true,
  isChild: true,
  phone: true,
  email: true,
  origin: true,
} as const;

// Pessoas na ordem em que entraram (uuidv7 cresce com o tempo).
const INVITATION = {
  id: true,
  label: true,
  maxCompanions: true,
  token: true,
  code: true,
  guests: { select: GUEST, orderBy: { id: 'asc' } },
} as const;

/** Importação de até 20.000 linhas: duas inserções em lote, com folga sobre os 5 s padrão. */
const IMPORT_TIMEOUT_MS = 30_000;

const searchFilter = (weddingId: string, search: string | undefined) =>
  search
    ? {
        OR: [
          { label: { contains: search, mode: 'insensitive' as const } },
          {
            guests: {
              some: { weddingId, name: { contains: search, mode: 'insensitive' as const } },
            },
          },
        ],
      }
    : {};

export const ANONYMIZED_GUEST_NAME = 'Convidado anonimizado';

// Convites e pessoas (spec 009). Todo método recebe o weddingId e filtra por ele (RNF01).
@Injectable()
export class InvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Convites cujo nome ou o de uma pessoa contenha o termo (RF02), por nome do convite. */
  async listPage(
    weddingId: string,
    search: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: InvitationRecord[]; total: number }> {
    const where = { weddingId, ...searchFilter(weddingId, search) };
    const [items, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        select: INVITATION,
        orderBy: [{ label: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.invitation.count({ where }),
    ]);
    return { items, total };
  }

  find(weddingId: string, invitationId: string, db: Tx = this.prisma) {
    return db.invitation.findFirst({ where: { id: invitationId, weddingId }, select: INVITATION });
  }

  findByToken(weddingId: string, token: string): Promise<InvitationRecord | null> {
    return this.prisma.invitation.findFirst({ where: { token, weddingId }, select: INVITATION });
  }

  findByCode(weddingId: string, code: string): Promise<InvitationRecord | null> {
    return this.prisma.invitation.findFirst({ where: { code, weddingId }, select: INVITATION });
  }

  async listCodes(weddingId: string): Promise<Set<string>> {
    const rows = await this.prisma.invitation.findMany({
      where: { weddingId },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  create(weddingId: string, invitation: NewInvitation): Promise<InvitationRecord> {
    const { guests, ...data } = invitation;
    return this.prisma.invitation.create({
      data: {
        ...data,
        weddingId,
        guests: { create: guests.map((guest) => ({ ...guest, weddingId })) },
      },
      select: INVITATION,
    });
  }

  async update(weddingId: string, invitationId: string, data: InvitationChanges) {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id: invitationId, weddingId },
      data,
    });
    return count > 0;
  }

  /** Troca token e código na mesma operação: os anteriores deixam de valer na hora (RF12). */
  async replaceCredentials(weddingId: string, invitationId: string, token: string, code: string) {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id: invitationId, weddingId },
      data: { token, code },
    });
    return count > 0;
  }

  /** As pessoas saem em cascata. */
  async delete(weddingId: string, invitationId: string) {
    const { count } = await this.prisma.invitation.deleteMany({
      where: { id: invitationId, weddingId },
    });
    return count > 0;
  }

  createGuest(
    weddingId: string,
    invitationId: string,
    guest: GuestData & { origin?: GuestOrigin },
    db: Tx = this.prisma,
  ): Promise<GuestRecord> {
    return db.guest.create({
      data: { ...guest, invitationId, weddingId },
      select: GUEST,
    });
  }

  findGuest(weddingId: string, guestId: string): Promise<GuestRecord | null> {
    return this.prisma.guest.findFirst({ where: { id: guestId, weddingId }, select: GUEST });
  }

  async updateGuest(
    weddingId: string,
    guestId: string,
    data: GuestChanges,
    db: Tx = this.prisma,
  ): Promise<boolean> {
    const { count } = await db.guest.updateMany({ where: { id: guestId, weddingId }, data });
    return count > 0;
  }

  /** Acompanhantes do convite que saíram da resposta (spec 010 RF06); as respostas vão junto. */
  async deleteCompanionsExcept(
    weddingId: string,
    invitationId: string,
    keepIds: string[],
    db: Tx = this.prisma,
  ): Promise<void> {
    await db.guest.deleteMany({
      where: { weddingId, invitationId, origin: 'COMPANION', id: { notIn: keepIds } },
    });
  }

  countGuests(weddingId: string, invitationId: string): Promise<number> {
    return this.prisma.guest.count({ where: { invitationId, weddingId } });
  }

  async deleteGuest(weddingId: string, guestId: string): Promise<void> {
    await this.prisma.guest.deleteMany({ where: { id: guestId, weddingId } });
  }

  /** Anonimização (spec 015): nome trocado, contato nulo, sem apagar linhas; rótulos ficam. */
  async anonymizeGuests(weddingId: string): Promise<void> {
    await this.prisma.guest.updateMany({
      where: { weddingId },
      data: { name: ANONYMIZED_GUEST_NAME, phone: null, email: null },
    });
  }

  /** Todas as pessoas do casamento numa consulta, com o nome do convite (RF08, RNF02). */
  async listPeople(weddingId: string): Promise<ExistingPerson[]> {
    const guests = await this.prisma.guest.findMany({
      where: { weddingId },
      select: { name: true, invitation: { select: { label: true } } },
    });
    return guests.map((guest) => ({ invitationLabel: guest.invitation.label, name: guest.name }));
  }

  /** Convites aceitos da planilha numa transação: tudo ou nada (RF06). */
  async createFromImport(
    weddingId: string,
    invitations: (ImportedInvitation & { token: string; code: string })[],
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.invitation.createManyAndReturn({
          data: invitations.map(({ label, maxCompanions, token, code }) => ({
            weddingId,
            label,
            maxCompanions,
            token,
            code,
          })),
          select: { id: true, token: true },
        });
        const idByToken = new Map(created.map((invitation) => [invitation.token, invitation.id]));
        await tx.guest.createMany({
          data: invitations.flatMap((invitation) =>
            invitation.guests.map((guest) => ({
              ...guest,
              weddingId,
              invitationId: idByToken.get(invitation.token),
            })),
          ),
        });
      },
      { timeout: IMPORT_TIMEOUT_MS },
    );
  }
}
