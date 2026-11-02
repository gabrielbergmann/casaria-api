import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';
import { isUniqueViolation } from '../../infra/prisma/unique-violation';

export interface WeddingDetails {
  coupleName: string;
  weddingDate: Date;
  slug: string;
}

const DETAILS = { coupleName: true, weddingDate: true, slug: true } as const;

const REDIRECT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// weddings e slug_redirects são tabelas globais. As consultas sem weddingId do contexto
// são as de resolução (spec 003 RF13): por slug, por id, por redirecionamento e as listas de ids
// das rotinas.
@Injectable()
export class WeddingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdBySlug(slug: string): Promise<string | null> {
    const wedding = await this.prisma.wedding.findUnique({ where: { slug }, select: { id: true } });
    return wedding?.id ?? null;
  }

  /** Slug atual do casamento que tem `oldSlug` como redirecionamento vigente em `now`. */
  async findRedirectTarget(oldSlug: string, now: Date): Promise<string | null> {
    const wedding = await this.prisma.wedding.findFirst({
      where: { slugRedirects: { some: { oldSlug, expiresAt: { gt: now } } } },
      select: { slug: true },
    });
    return wedding?.slug ?? null;
  }

  async exists(weddingId: string): Promise<boolean> {
    const wedding = await this.prisma.wedding.findUnique({
      where: { id: weddingId },
      select: { id: true },
    });
    return wedding !== null;
  }

  async findSlug(weddingId: string): Promise<string | null> {
    const wedding = await this.prisma.wedding.findUnique({
      where: { id: weddingId },
      select: { slug: true },
    });
    return wedding?.slug ?? null;
  }

  /** Um slug está ocupado se for o atual de outro casamento ou redirecionamento vigente dele. */
  /** `weddingId` nulo na criação de um casamento (spec 005). */
  async isSlugTakenByAnother(weddingId: string | null, slug: string, now: Date): Promise<boolean> {
    const notThisWedding = weddingId ? { not: weddingId } : undefined;
    const [current, redirect] = await Promise.all([
      this.prisma.wedding.findFirst({
        where: { slug, id: notThisWedding },
        select: { id: true },
      }),
      this.prisma.slugRedirect.findFirst({
        where: { oldSlug: slug, expiresAt: { gt: now }, weddingId: notThisWedding },
        select: { id: true },
      }),
    ]);
    return current !== null || redirect !== null;
  }

  /**
   * Troca o slug e grava o anterior como redirecionamento por 90 dias, numa transação.
   * Apaga, no mesmo passo, o redirecionamento vencido de quem tinha o novo slug e o do próprio
   * casamento para o novo slug (o casal pode voltar atrás). Retorna false em colisão de índice
   * único (disputa simultânea pelo slug).
   */
  async changeSlug(weddingId: string, oldSlug: string, newSlug: string, now: Date) {
    const expiresAt = new Date(now.getTime() + REDIRECT_DAYS * DAY_MS);
    try {
      await this.prisma.$transaction([
        this.prisma.slugRedirect.deleteMany({
          where: { oldSlug: newSlug, OR: [{ weddingId }, { expiresAt: { lte: now } }] },
        }),
        this.prisma.wedding.update({ where: { id: weddingId }, data: { slug: newSlug } }),
        this.prisma.slugRedirect.create({ data: { oldSlug, weddingId, expiresAt } }),
      ]);
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Cria o casamento; null em colisão do slug (índice único). */
  async create(data: WeddingDetails, db: Tx = this.prisma): Promise<string | null> {
    try {
      const wedding = await db.wedding.create({ data, select: { id: true } });
      return wedding.id;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  findDetails(weddingId: string): Promise<WeddingDetails | null> {
    return this.prisma.wedding.findUnique({ where: { id: weddingId }, select: DETAILS });
  }

  async updateDetails(
    weddingId: string,
    data: Partial<Pick<WeddingDetails, 'coupleName' | 'weddingDate'>>,
  ): Promise<void> {
    await this.prisma.wedding.update({ where: { id: weddingId }, data });
  }

  /** Apaga o casamento; wedding_members, slug_redirects e o resto caem em cascata. */
  async delete(weddingId: string): Promise<void> {
    await this.prisma.wedding.delete({ where: { id: weddingId } });
  }

  /** Lista da Administração (superadmin), por data do casamento. */
  listAll() {
    return this.prisma.wedding.findMany({
      select: { id: true, ...DETAILS },
      orderBy: [{ weddingDate: 'asc' }, { id: 'asc' }],
    });
  }

  /** Ids de todos os casamentos, para as rotinas que atravessam casamentos (RF14). */
  /** Casamentos já realizados e ainda sem anonimização; o prazo de 6 meses é do service. */
  listNotAnonymizedUntil(now: Date): Promise<{ id: string; weddingDate: Date }[]> {
    return this.prisma.wedding.findMany({
      where: { personalDataAnonymizedAt: null, weddingDate: { lte: now } },
      select: { id: true, weddingDate: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Grava a marca uma vez só; repetir não muda o instante (spec 015 RNF03). */
  async markAnonymized(weddingId: string, now: Date): Promise<void> {
    await this.prisma.wedding.updateMany({
      where: { id: weddingId, personalDataAnonymizedAt: null },
      data: { personalDataAnonymizedAt: now },
    });
  }

  async listIds(): Promise<string[]> {
    const weddings = await this.prisma.wedding.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return weddings.map((wedding) => wedding.id);
  }
}
