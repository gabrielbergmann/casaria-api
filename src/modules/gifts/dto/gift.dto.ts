import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MediaViewSchema } from '../../media/dto/media.dto';

// Catálogo de presentes (spec 011). Valores sempre em centavos inteiros (PRD RNF04); os reais
// viram centavos só no front. Sem mínimo nem máximo da plataforma: o teto é o do int do banco.

const CENTS_ERROR = 'Informe um valor maior que zero, em centavos inteiros.';
const QUOTA_TOTAL_ERROR = 'Informe um número inteiro de cotas maior que zero.';
const QUANTITY_ERROR = 'Informe uma quantidade inteira maior que zero ou "sem limite".';

const Cents = z.int32({ error: CENTS_ERROR }).positive({ error: CENTS_ERROR });

const base = {
  title: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome do presente.' })
    .max(120, { error: 'Use até 120 caracteres.' }),
  /** Vazio ou ausente = sem descrição. */
  description: z
    .string()
    .trim()
    .max(1000, { error: 'Use até 1.000 caracteres.' })
    .transform((value) => value || null)
    .nullish(),
  mediaId: z.uuid().nullish(),
  categoryId: z.uuid().nullish(),
};

export const GIFT_TYPES = ['VIRTUAL', 'QUOTA', 'FREE_AMOUNT'] as const;

/**
 * Entrada do POST e do PUT. Os campos de valor dependem do tipo (skill presentes §1): o que
 * falta é recusado aqui, e o que sobra de outro tipo é ignorado.
 */
export const GiftInputSchema = z
  .object({
    ...base,
    type: z.enum(GIFT_TYPES),
    priceCents: Cents.optional(),
    quotaPriceCents: Cents.optional(),
    quotaTotal: z
      .int32({ error: QUOTA_TOTAL_ERROR })
      .positive({ error: QUOTA_TOTAL_ERROR })
      .optional(),
    /** Só no VIRTUAL: unidades que podem ser dadas; null ou ausente = sem limite (spec 018). */
    // min(1), não positive(): o exclusiveMinimum de campo anulável quebra a validação do orval.
    quantityTotal: z.int32({ error: QUANTITY_ERROR }).min(1, { error: QUANTITY_ERROR }).nullish(),
    /** Esgotado some do site em vez de aparecer como "Já presenteado" (spec 018 RF06). */
    hideWhenSoldOut: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    const required =
      input.type === 'VIRTUAL'
        ? (['priceCents'] as const)
        : input.type === 'QUOTA'
          ? (['quotaPriceCents', 'quotaTotal'] as const)
          : [];
    for (const field of required) {
      if (input[field] === undefined) {
        const message = field === 'quotaTotal' ? QUOTA_TOTAL_ERROR : CENTS_ERROR;
        ctx.addIssue({ code: 'custom', path: [field], message });
      }
    }
  });

export type GiftInput = z.infer<typeof GiftInputSchema>;

export class GiftInputDto extends createZodDto(GiftInputSchema) {}

export const GiftOrderSchema = z.object({
  giftIds: z.array(z.uuid()).max(10_000),
});

export class GiftOrderDto extends createZodDto(GiftOrderSchema) {}

export const GiftCategoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome da categoria.' })
    .max(60, { error: 'Use até 60 caracteres.' }),
});

export class GiftCategoryInputDto extends createZodDto(GiftCategoryInputSchema) {}

// --- Respostas -----------------------------------------------------------------------------

export const GiftCategorySchema = z.object({ id: z.uuid(), name: z.string().max(60) });

export class GiftCategoryDto extends createZodDto(GiftCategorySchema) {}

export const GiftCategoryListSchema = z.object({ categories: z.array(GiftCategorySchema) });

export class GiftCategoryListDto extends createZodDto(GiftCategoryListSchema) {}

/**
 * O que a vitrine mostra de cada presente: nada de pedidos ou presenteadores. Só os campos do
 * tipo vêm preenchidos: priceCents no VIRTUAL e o progresso na QUOTA.
 */
const ShowcaseGiftSchema = z.object({
  id: z.uuid(),
  type: z.enum(GIFT_TYPES),
  title: z.string().max(120),
  description: z.string().max(1000).nullable(),
  image: MediaViewSchema.nullable(),
  categoryId: z.uuid().nullable(),
  /** Cota ou preço fixo com quantidade: total − vendidas − reservadas ≤ 0 (RF10; spec 018). */
  soldOut: z.boolean(),
  priceCents: z.int().optional(),
  /** VIRTUAL: quantidade e unidades livres; null = sem limite (spec 018). */
  quantityTotal: z.int().nullable().optional(),
  quantityAvailable: z.int().nullable().optional(),
  quotaPriceCents: z.int().optional(),
  quotaTotal: z.int().optional(),
  quotasAvailable: z.int().optional(),
  /** vendidas × valor da cota (skill presentes §4). */
  collectedCents: z.int().optional(),
  /** total × valor da cota. */
  goalCents: z.int().optional(),
});

export const ShowcaseSchema = z.object({
  /** Só as categorias com presente ativo, por nome (RF09). */
  categories: z.array(GiftCategorySchema),
  /** Presentes ativos na ordem do catálogo (RF08). */
  gifts: z.array(ShowcaseGiftSchema),
});

export class ShowcaseDto extends createZodDto(ShowcaseSchema) {}

/** Visão do painel: a da vitrine mais o mediaId e, na cota, os contadores. */
export const GiftSchema = ShowcaseGiftSchema.extend({
  mediaId: z.uuid().nullable(),
  hideWhenSoldOut: z.boolean(),
  quotasSold: z.int().optional(),
  quotasReserved: z.int().optional(),
});

export class GiftDto extends createZodDto(GiftSchema) {}

export const GiftListSchema = z.object({ gifts: z.array(GiftSchema) });

export class GiftListDto extends createZodDto(GiftListSchema) {}
