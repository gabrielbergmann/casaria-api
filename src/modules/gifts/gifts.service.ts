import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../common/time/clock';
import type { Tx } from '../../infra/prisma/transaction-runner';
import { MediaService } from '../media/media.service';
import type { GiftInput } from './dto/gift.dto';
import {
  GiftInvalidAmount,
  GiftInvalidCategory,
  GiftInvalidMedia,
  GiftInvalidOrder,
  GiftNotFound,
  GiftSoldOut,
} from './errors/gift-errors';
import { GiftCategoriesRepository, type GiftCategoryRecord } from './gift-categories.repository';
import {
  assertQuotaEdit,
  availableUnits,
  hasLimit,
  isHiddenFromSite,
  type PanelGift,
  type ShowcaseGift,
  toGiftData,
  toPanelGift,
  toShowcaseGift,
} from './gift-rules';
import { type GiftData, type GiftRecord, GiftsRepository } from './gifts.repository';

const isUuid = (value: string) => z.uuid().safeParse(value).success;

export interface Showcase {
  categories: GiftCategoryRecord[];
  gifts: ShowcaseGift[];
}

/**
 * O que o convidado escolheu: cotas (QUOTA), unidades (VIRTUAL com quantidade, spec 018) ou valor
 * (FREE_AMOUNT); o preço vem do catálogo.
 */
export interface CheckoutRequest {
  quantity?: number;
  amountCents?: number;
}

export interface CheckoutPrice {
  giftId: string;
  title: string;
  quantity: number;
  priceCents: number;
}

/** Teto do int do banco para valores em centavos. */
const MAX_CENTS = 2_147_483_647;

/**
 * Preço calculado no servidor (spec 012 RF06): quantidade na cota e no preço fixo com limite
 * (spec 018 RF03), valor só no valor livre.
 */
function priceFor(gift: GiftRecord, request: CheckoutRequest): CheckoutPrice {
  const base = { giftId: gift.id, title: gift.title };
  if (gift.type === 'VIRTUAL' || gift.type === 'QUOTA') {
    const unitCents = gift.type === 'VIRTUAL' ? gift.priceCents : gift.quotaPriceCents;
    const quantity = hasLimit(gift) ? (request.quantity ?? 1) : 1;
    const priceCents = quantity * unitCents;
    if (priceCents > MAX_CENTS) throw new GiftInvalidAmount();
    return { ...base, quantity, priceCents };
  }
  const amount = request.amountCents;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CENTS) throw new GiftInvalidAmount();
  return { ...base, quantity: 1, priceCents: amount };
}

/**
 * Catálogo de presentes (spec 011): regras por tipo, ordem, exclusão lógica, trava de cotas e a
 * vitrine. Não importa payments (ADR-002 da 011); registra no MediaService o uso das fotos.
 */
@Injectable()
export class GiftsService implements OnModuleInit {
  constructor(
    private readonly repository: GiftsRepository,
    private readonly categories: GiftCategoriesRepository,
    private readonly media: MediaService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.media.registerUsageChecker({
      place: 'gifts',
      isInUse: (weddingId, mediaId) => this.repository.usesMedia(weddingId, mediaId),
    });
  }

  async list(weddingId: string): Promise<PanelGift[]> {
    const gifts = await this.repository.listActive(weddingId);
    const media = await this.resolveMedia(weddingId, gifts);
    return gifts.map((gift) => toPanelGift(gift, media));
  }

  /** Vitrine do site e do preview: duas consultas e uma resolução de fotos (RNF04). */
  async getShowcase(weddingId: string): Promise<Showcase> {
    const [gifts, categories] = await Promise.all([
      this.repository.listActive(weddingId),
      this.categories.listWithActiveGifts(weddingId),
    ]);
    const visible = gifts.filter((gift) => !isHiddenFromSite(gift));
    const media = await this.resolveMedia(weddingId, visible);
    // Categoria cujos presentes estão todos esgotados e escondidos some com eles (spec 018).
    const visibleCategories = new Set(visible.map((gift) => gift.categoryId));
    const hiddenCategories = new Set(gifts.filter(isHiddenFromSite).map((gift) => gift.categoryId));
    return {
      categories: categories.filter(
        (category) => visibleCategories.has(category.id) || !hiddenCategories.has(category.id),
      ),
      gifts: visible.map((gift) => toShowcaseGift(gift, media)),
    };
  }

  async create(weddingId: string, input: GiftInput): Promise<PanelGift> {
    const data = toGiftData(input);
    await this.assertReferences(weddingId, data);
    return this.toView(weddingId, await this.repository.create(weddingId, data));
  }

  /** Substitui os campos do casal; os contadores de cota não mudam (RF06, RF10). */
  async update(weddingId: string, giftId: string, input: GiftInput): Promise<PanelGift> {
    const data = toGiftData(input);
    assertQuotaEdit(await this.getActive(weddingId, giftId), data);
    await this.assertReferences(weddingId, data);
    if (!(await this.repository.update(weddingId, giftId, data))) {
      // Uma reserva da 012 entrou entre a leitura e a escrita: confere de novo com o estado atual.
      assertQuotaEdit(await this.getActive(weddingId, giftId), data);
      throw new GiftNotFound();
    }
    return this.toView(weddingId, await this.getActive(weddingId, giftId));
  }

  async delete(weddingId: string, giftId: string): Promise<void> {
    if (
      !isUuid(giftId) ||
      !(await this.repository.softDelete(weddingId, giftId, this.clock.now()))
    ) {
      throw new GiftNotFound();
    }
  }

  /** Grava só se a lista trouxer cada presente ativo uma única vez; senão mantém a anterior (RF04). */
  async reorder(weddingId: string, giftIds: string[]): Promise<void> {
    const current = new Set((await this.repository.listActive(weddingId)).map((gift) => gift.id));
    const received = new Set(giftIds);
    const sameGifts =
      received.size === giftIds.length &&
      received.size === current.size &&
      giftIds.every((id) => current.has(id));
    if (!sameGifts) throw new GiftInvalidOrder();
    await this.repository.reorder(weddingId, giftIds);
  }

  // --- Operações para payments (012): só elas escrevem os contadores, no tx de quem chama.

  /** Preço e disponibilidade sem reservar (passo 3 do checkout). */
  async quoteForCheckout(
    weddingId: string,
    giftId: string,
    request: CheckoutRequest,
  ): Promise<CheckoutPrice> {
    const gift = await this.getActive(weddingId, giftId);
    const price = priceFor(gift, request);
    if (hasLimit(gift) && price.quantity > availableUnits(gift)) throw new GiftSoldOut();
    return price;
  }

  /** Reserva as cotas por UPDATE condicional (RF07 e RF08 da 012); sem cota livre, gift.sold_out. */
  async reserveForCheckout(
    weddingId: string,
    giftId: string,
    request: CheckoutRequest,
    tx: Tx,
  ): Promise<CheckoutPrice> {
    const gift = await this.getActive(weddingId, giftId, tx);
    const price = priceFor(gift, request);
    // Sem limite e valor livre não esgotam: só cota e preço fixo com quantidade têm contador.
    if (
      hasLimit(gift) &&
      !(await this.repository.reserveQuotas(weddingId, gift.id, price.quantity, tx))
    ) {
      throw new GiftSoldOut();
    }
    return price;
  }

  /** Pagamento aprovado: as reservadas viram vendidas. false = contadores já não batiam. */
  confirmQuotas(weddingId: string, giftId: string, quantity: number, tx: Tx) {
    return this.repository.confirmQuotas(weddingId, giftId, quantity, tx);
  }

  releaseReservation(weddingId: string, giftId: string, quantity: number, tx: Tx) {
    return this.repository.releaseReservedQuotas(weddingId, giftId, quantity, tx);
  }

  releaseSold(weddingId: string, giftId: string, quantity: number, tx: Tx) {
    return this.repository.releaseSoldQuotas(weddingId, giftId, quantity, tx);
  }

  /** Títulos para Recebidos, inclusive de presentes excluídos. */
  async getTitles(weddingId: string, giftIds: string[]): Promise<Record<string, string>> {
    if (giftIds.length === 0) return {};
    const rows = await this.repository.findTitles(weddingId, [...new Set(giftIds)]);
    return Object.fromEntries(rows.map((row) => [row.id, row.title]));
  }

  private async getActive(weddingId: string, giftId: string, tx?: Tx): Promise<GiftRecord> {
    const gift = isUuid(giftId) ? await this.repository.findActive(weddingId, giftId, tx) : null;
    if (!gift) throw new GiftNotFound();
    return gift;
  }

  /** Foto e categoria precisam ser do casamento (RF02). */
  private async assertReferences(weddingId: string, data: GiftData): Promise<void> {
    if (data.mediaId && !(await this.media.resolve(weddingId, [data.mediaId]))[data.mediaId]) {
      throw new GiftInvalidMedia();
    }
    if (data.categoryId && !(await this.categories.exists(weddingId, data.categoryId))) {
      throw new GiftInvalidCategory();
    }
  }

  private async toView(weddingId: string, gift: GiftRecord): Promise<PanelGift> {
    return toPanelGift(gift, await this.resolveMedia(weddingId, [gift]));
  }

  private resolveMedia(weddingId: string, gifts: GiftRecord[]) {
    return this.media.resolve(
      weddingId,
      gifts.map((gift) => gift.mediaId).filter((id): id is string => id !== null),
    );
  }
}
