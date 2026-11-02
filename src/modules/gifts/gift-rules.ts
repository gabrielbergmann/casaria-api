import type { MediaView } from '../media/media.service';
import type { GiftInput } from './dto/gift.dto';
import { GiftLocked, GiftQuotaTotalTooLow } from './errors/gift-errors';
import type { GiftData, GiftRecord } from './gifts.repository';

// Regras do catálogo (skill presentes §1, §3 e §4), puras para os testes.

/** Campos do tipo; os demais ficam nulos, como pede o CHECK da tabela. */
export function toGiftData(input: GiftInput): GiftData {
  const base = {
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    mediaId: input.mediaId ?? null,
    categoryId: input.categoryId ?? null,
    priceCents: null,
    quotaPriceCents: null,
    quotaTotal: null,
    hideWhenSoldOut: input.hideWhenSoldOut ?? false,
  };
  if (input.type === 'VIRTUAL') {
    return { ...base, priceCents: input.priceCents, quotaTotal: input.quantityTotal ?? null };
  }
  if (input.type === 'QUOTA') {
    return { ...base, quotaPriceCents: input.quotaPriceCents, quotaTotal: input.quotaTotal };
  }
  return base;
}

const committedQuotas = (gift: GiftRecord) => gift.quotasSold + gift.quotasReserved;

/** Cota e preço fixo com quantidade têm total e contadores; o resto aceita vários presenteadores. */
export const hasLimit = (gift: Pick<GiftRecord, 'type' | 'quotaTotal'>) =>
  gift.type === 'QUOTA' || (gift.type === 'VIRTUAL' && gift.quotaTotal !== null);

/** Cotas ou unidades livres; null quando não há limite. */
export const availableUnits = (gift: GiftRecord) =>
  hasLimit(gift) ? Math.max(gift.quotaTotal - committedQuotas(gift), 0) : null;

/**
 * Com cota ou unidade vendida ou reservada, o tipo (e na cota o valor) trava, o limite não sai e o
 * total cabe nelas (RF06; spec 018 RF02).
 */
export function assertQuotaEdit(gift: GiftRecord, data: GiftData): void {
  const committed = committedQuotas(gift);
  if (committed === 0) return;
  if (data.type !== gift.type || data.quotaTotal === null) throw new GiftLocked();
  if (gift.type === 'QUOTA' && data.quotaPriceCents !== gift.quotaPriceCents) {
    throw new GiftLocked();
  }
  if (data.quotaTotal < committed) throw new GiftQuotaTotalTooLow();
}

export function quotaProgress(gift: GiftRecord) {
  return {
    quotaPriceCents: gift.quotaPriceCents,
    quotaTotal: gift.quotaTotal,
    quotasAvailable: Math.max(gift.quotaTotal - committedQuotas(gift), 0),
    collectedCents: gift.quotasSold * gift.quotaPriceCents,
    goalCents: gift.quotaTotal * gift.quotaPriceCents,
  };
}

/** Esgota quem tem limite (RF10; spec 018); sem limite e valor livre aceitam vários. */
export const isSoldOut = (gift: GiftRecord) => availableUnits(gift) === 0;

/** Esgotado com a opção de esconder some do site e continua no painel (spec 018 RF06). */
export const isHiddenFromSite = (gift: GiftRecord) => gift.hideWhenSoldOut && isSoldOut(gift);

/** Presente como o site o vê: sem contadores crus, pedidos ou presenteadores. */
export function toShowcaseGift(gift: GiftRecord, media: Record<string, MediaView>) {
  const base = {
    id: gift.id,
    title: gift.title,
    description: gift.description,
    image: (gift.mediaId && media[gift.mediaId]) || null,
    categoryId: gift.categoryId,
    soldOut: isSoldOut(gift),
  };
  if (gift.type === 'VIRTUAL') {
    return {
      ...base,
      type: gift.type,
      priceCents: gift.priceCents,
      quantityTotal: gift.quotaTotal,
      quantityAvailable: availableUnits(gift),
    };
  }
  if (gift.type === 'QUOTA') return { ...base, type: gift.type, ...quotaProgress(gift) };
  return { ...base, type: gift.type };
}

export type ShowcaseGift = ReturnType<typeof toShowcaseGift>;

/** Presente como o painel o vê: a visão da vitrine, o mediaId, a opção ao esgotar e os contadores. */
export function toPanelGift(gift: GiftRecord, media: Record<string, MediaView>) {
  const view = {
    ...toShowcaseGift(gift, media),
    mediaId: gift.mediaId,
    hideWhenSoldOut: gift.hideWhenSoldOut,
  };
  if (view.type !== 'QUOTA') return view;
  return { ...view, quotasSold: gift.quotasSold, quotasReserved: gift.quotasReserved };
}

export type PanelGift = ReturnType<typeof toPanelGift>;
