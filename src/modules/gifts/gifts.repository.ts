import { Injectable } from '@nestjs/common';
import type { GiftType } from '../../generated/prisma/enums';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';

export interface GiftRecord {
  id: string;
  type: GiftType;
  title: string;
  description: string | null;
  mediaId: string | null;
  categoryId: string | null;
  priceCents: number | null;
  quotaPriceCents: number | null;
  /** QUOTA: total de cotas. VIRTUAL: quantidade, nula = sem limite (spec 018). */
  quotaTotal: number | null;
  quotasSold: number;
  quotasReserved: number;
  hideWhenSoldOut: boolean;
}

/** Campos que o casal edita; os contadores nunca entram aqui (só a 012 os escreve). */
export interface GiftData {
  type: GiftType;
  title: string;
  description: string | null;
  mediaId: string | null;
  categoryId: string | null;
  priceCents: number | null;
  quotaPriceCents: number | null;
  quotaTotal: number | null;
  hideWhenSoldOut: boolean;
}

const GIFT = {
  id: true,
  type: true,
  title: true,
  description: true,
  mediaId: true,
  categoryId: true,
  priceCents: true,
  quotaPriceCents: true,
  quotaTotal: true,
  quotasSold: true,
  quotasReserved: true,
  hideWhenSoldOut: true,
} as const;

const active = (weddingId: string) => ({ weddingId, deletedAt: null });

// Presentes (spec 011). Todo método recebe o weddingId e filtra por ele (RNF01); excluído é
// deleted_at preenchido e some de toda leitura do catálogo.
@Injectable()
export class GiftsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ativos na ordem do catálogo; empate de posição fica na ordem de criação (uuidv7). */
  listActive(weddingId: string): Promise<GiftRecord[]> {
    return this.prisma.gift.findMany({
      where: active(weddingId),
      select: GIFT,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  findActive(weddingId: string, giftId: string, db: Tx = this.prisma): Promise<GiftRecord | null> {
    return db.gift.findFirst({ where: { id: giftId, ...active(weddingId) }, select: GIFT });
  }

  /** Entra no fim da lista: maior posição do casamento + 1 (RF04). */
  async create(weddingId: string, data: GiftData): Promise<GiftRecord> {
    const last = await this.prisma.gift.aggregate({
      where: { weddingId },
      _max: { position: true },
    });
    return this.prisma.gift.create({
      data: { ...data, weddingId, position: (last._max.position ?? 0) + 1 },
      select: GIFT,
    });
  }

  /**
   * Substitui os campos do casal num UPDATE condicional (spec 011, "Riscos"): com cotas ou
   * unidades vendidas ou reservadas, só grava se o tipo (e na cota o valor da cota) for o mesmo e
   * o novo total couber nelas (spec 018). false = presente inexistente, excluído ou travado entre
   * a leitura e a escrita.
   */
  async update(weddingId: string, giftId: string, data: GiftData): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE gifts
         SET type = ${data.type}::gift_type,
             title = ${data.title},
             description = ${data.description},
             media_id = ${data.mediaId}::uuid,
             category_id = ${data.categoryId}::uuid,
             price_cents = ${data.priceCents}::int,
             quota_price_cents = ${data.quotaPriceCents}::int,
             quota_total = ${data.quotaTotal}::int,
             hide_when_sold_out = ${data.hideWhenSoldOut},
             updated_at = now()
       WHERE id = ${giftId}::uuid
         AND wedding_id = ${weddingId}::uuid
         AND deleted_at IS NULL
         AND quotas_sold + quotas_reserved <= COALESCE(${data.quotaTotal}::int, 0)
         AND (quotas_sold + quotas_reserved = 0
              OR (type = ${data.type}::gift_type
                  AND (type = 'VIRTUAL' OR quota_price_cents = ${data.quotaPriceCents}::int)))`;
    return updated === 1;
  }

  /** Exclusão lógica (RF05): o registro fica para os pedidos da 012. */
  async softDelete(weddingId: string, giftId: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.gift.updateMany({
      where: { id: giftId, ...active(weddingId) },
      data: { deletedAt: now },
    });
    return count === 1;
  }

  /** Grava as posições 1..n na ordem recebida, numa transação. */
  async reorder(weddingId: string, giftIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      giftIds.map((id, index) =>
        this.prisma.gift.updateMany({
          where: { id, ...active(weddingId) },
          data: { position: index + 1 },
        }),
      ),
    );
  }

  // --- Contadores de cota e de unidades: só as operações chamadas por payments (012) os escrevem,
  // sempre por UPDATE condicional no tx de quem chama (skill database §10). Valem para presente
  // com total (cota e preço fixo com quantidade, spec 018). false = nada mudou.

  /** Reserva só se couber: vendidas + reservadas + quantidade ≤ total (RF23 do PRD). */
  async reserveQuotas(weddingId: string, giftId: string, quantity: number, db: Tx) {
    const updated = await db.$executeRaw`
      UPDATE gifts SET quotas_reserved = quotas_reserved + ${quantity}::int, updated_at = now()
       WHERE id = ${giftId}::uuid AND wedding_id = ${weddingId}::uuid AND quota_total IS NOT NULL
         AND deleted_at IS NULL
         AND quotas_sold + quotas_reserved + ${quantity}::int <= quota_total`;
    return updated === 1;
  }

  /** Reservadas viram vendidas (pagamento aprovado), mesmo de presente já excluído. */
  async confirmQuotas(weddingId: string, giftId: string, quantity: number, db: Tx) {
    const updated = await db.$executeRaw`
      UPDATE gifts SET quotas_sold = quotas_sold + ${quantity}::int,
                       quotas_reserved = quotas_reserved - ${quantity}::int, updated_at = now()
       WHERE id = ${giftId}::uuid AND wedding_id = ${weddingId}::uuid AND quota_total IS NOT NULL
         AND quotas_reserved >= ${quantity}::int`;
    return updated === 1;
  }

  /** Devolve a reserva (recusa, falha ou expiração). */
  async releaseReservedQuotas(weddingId: string, giftId: string, quantity: number, db: Tx) {
    const updated = await db.$executeRaw`
      UPDATE gifts SET quotas_reserved = quotas_reserved - ${quantity}::int, updated_at = now()
       WHERE id = ${giftId}::uuid AND wedding_id = ${weddingId}::uuid AND quota_total IS NOT NULL
         AND quotas_reserved >= ${quantity}::int`;
    return updated === 1;
  }

  /** Devolve cotas vendidas (estorno ou contestação, PRD RF32). */
  async releaseSoldQuotas(weddingId: string, giftId: string, quantity: number, db: Tx) {
    const updated = await db.$executeRaw`
      UPDATE gifts SET quotas_sold = quotas_sold - ${quantity}::int, updated_at = now()
       WHERE id = ${giftId}::uuid AND wedding_id = ${weddingId}::uuid AND quota_total IS NOT NULL
         AND quotas_sold >= ${quantity}::int`;
    return updated === 1;
  }

  /** Títulos para Recebidos, inclusive de presentes excluídos. */
  findTitles(weddingId: string, giftIds: string[]): Promise<{ id: string; title: string }[]> {
    return this.prisma.gift.findMany({
      where: { weddingId, id: { in: giftIds } },
      select: { id: true, title: true },
    });
  }

  /** Foto de presente ativo não pode ser excluída (PRD RF11a). */
  async usesMedia(weddingId: string, mediaId: string): Promise<boolean> {
    const count = await this.prisma.gift.count({ where: { mediaId, ...active(weddingId) } });
    return count > 0;
  }
}
