import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { cpfDigits, isValidCpf } from '../../../common/personal-data/cpf';

// Pagamentos (spec 012). Valores em centavos inteiros; o preço vem do catálogo e o que o site
// mandar de preço é descartado (Zod tira as chaves fora do schema).

const METHODS = ['PIX', 'CARD'] as const;
/** Pedido gravado: PIX_DIRECT é o Pix na chave do casal (spec 017). */
const ORDER_METHODS = ['PIX', 'CARD', 'PIX_DIRECT'] as const;
const ORDER_STATUSES = [
  'PENDING',
  'IN_PROCESS',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'REFUNDED',
  'CHARGED_BACK',
  'AWAITING_CONFIRMATION',
] as const;

// --- Painel: conta e taxas ------------------------------------------------------------------

export const PaymentAccountSchema = z.object({
  status: z.enum(['NOT_CONNECTED', 'CONNECTED', 'DISCONNECTED']),
  disconnectReason: z.enum(['OWNER', 'REFRESH_FAILED', 'DEAUTHORIZED']).nullable(),
  connectedAt: z.iso.datetime().nullable(),
  disconnectedAt: z.iso.datetime().nullable(),
});

export class PaymentAccountDto extends createZodDto(PaymentAccountSchema) {}

export const AuthorizationUrlSchema = z.object({ authorizationUrl: z.url() });

export class AuthorizationUrlDto extends createZodDto(AuthorizationUrlSchema) {}

/** Validação de faixa no service: fora dela, payment.invalid_fee (RF05). */
const FeeSchema = z.object({ percentBps: z.int(), fixedCents: z.int() });

export const PaymentFeesSchema = z.object({ pix: FeeSchema, card: FeeSchema });

export class PaymentFeesDto extends createZodDto(PaymentFeesSchema) {}

const PIX_KEY_TYPES = ['CPF', 'CNPJ', 'PHONE', 'EMAIL', 'RANDOM'] as const;

/** Validação da chave pelo tipo no service: inválida, payment.invalid_pix_key (spec 017 RF02). */
export const PixKeyInputSchema = z.object({
  keyType: z.enum(PIX_KEY_TYPES),
  key: z.string().trim().min(1).max(100),
});

export class PixKeyInputDto extends createZodDto(PixKeyInputSchema) {}

export const PixKeySchema = z.object({
  pixKey: z.object({ keyType: z.enum(PIX_KEY_TYPES), key: z.string().max(100) }).nullable(),
});

export class PixKeyDto extends createZodDto(PixKeySchema) {}

export const ReceivedGiftListSchema = z.object({
  items: z.array(
    z.object({
      orderId: z.uuid(),
      giftTitle: z.string().max(120),
      quantity: z.int(),
      /** Nome do presenteador ou "Anônimo"; nunca CPF nem email. */
      giver: z.string().max(120),
      amountCents: z.int(),
      feeCents: z.int(),
      method: z.enum(ORDER_METHODS),
      message: z.string().max(1000).nullable(),
      status: z.enum(ORDER_STATUSES),
      approvedAt: z.iso.datetime(),
      thankedAt: z.iso.datetime().nullable(),
    }),
  ),
});

export class ReceivedGiftListDto extends createZodDto(ReceivedGiftListSchema) {}

/** Pix direto "A conferir" (spec 017 RF09): sem CPF nem email. */
export const AwaitingGiftListSchema = z.object({
  items: z.array(
    z.object({
      orderId: z.uuid(),
      giftTitle: z.string().max(120),
      quantity: z.int(),
      giver: z.string().max(120),
      amountCents: z.int(),
      message: z.string().max(1000).nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

export class AwaitingGiftListDto extends createZodDto(AwaitingGiftListSchema) {}

/** Lista reduzida de Recebidos do editor (spec 014 RF09), com a data para habilitar a caixa. */
export const ReceivedGiftSummarySchema = z.object({
  weddingDate: z.iso.datetime(),
  items: z.array(
    z.object({
      orderId: z.uuid(),
      giftTitle: z.string().max(120),
      /** Nome do presenteador ou "Anônimo". */
      giver: z.string().max(120),
      thanked: z.boolean(),
    }),
  ),
});

export class ReceivedGiftSummaryDto extends createZodDto(ReceivedGiftSummarySchema) {}

// --- Site: checkout ---------------------------------------------------------------------------

/** Pix com chave ou conta, cartão só com conta (spec 017 RF05). */
export const CheckoutAvailabilitySchema = z.object({
  checkoutAvailable: z.boolean(),
  pix: z.boolean(),
  card: z.boolean(),
});

export class CheckoutAvailabilityDto extends createZodDto(CheckoutAvailabilitySchema) {}

const giftChoice = {
  giftId: z.uuid(),
  /** Cotas da cota ou unidades do preço fixo com quantidade (padrão 1; spec 018). */
  quantity: z.int().min(1).max(100_000).optional(),
  /** Valor digitado no valor livre, em centavos. */
  amountCents: z.int32().positive().optional(),
};

export const QuoteInputSchema = z.object(giftChoice);

export class QuoteInputDto extends createZodDto(QuoteInputSchema) {}

const ChargeSchema = z.object({ feeCents: z.int(), totalCents: z.int() });

export const QuoteSchema = z.object({
  priceCents: z.int(),
  pix: ChargeSchema,
  card: ChargeSchema,
});

export class QuoteDto extends createZodDto(QuoteSchema) {}

export const CreateOrderSchema = z.object({
  ...giftChoice,
  method: z.enum(METHODS),
  payer: z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Informe seu nome.' })
      .max(120, { error: 'Use até 120 caracteres.' }),
    email: z.email({ error: 'Email inválido. Use o formato nome@exemplo.com.' }).max(254),
    cpf: z.string().max(20).refine(isValidCpf, { error: 'CPF inválido.' }).transform(cpfDigits),
  }),
  message: z
    .string()
    .trim()
    .max(1000, { error: 'Use até 1.000 caracteres.' })
    .transform((value) => value || null)
    .nullish(),
  /** "Não mostrar meu nome ao casal". */
  isAnonymous: z.boolean().default(false),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}

export const CreatedOrderSchema = z.object({
  orderId: z.uuid(),
  method: z.enum(ORDER_METHODS),
  status: z.enum(ORDER_STATUSES),
  priceCents: z.int(),
  feeCents: z.int(),
  totalCents: z.int(),
  reservationExpiresAt: z.iso.datetime(),
  /** ***.***.***-NN: o único lugar em que o CPF volta, mascarado. */
  payerCpfMasked: z.string().max(20),
  /**
   * Só no Pix: copia e cola e o QR em PNG base64. direct: Pix na chave do casal, sem QR pronto
   * (o site desenha a partir do copia e cola) e com "Já fiz o Pix" (spec 017).
   */
  pix: z
    .object({
      qrCode: z.string().max(2000),
      qrCodeBase64: z.string().max(200_000).nullable(),
      direct: z.boolean(),
    })
    .optional(),
  /** Só no cartão: a public key do casal para o Brick. */
  card: z.object({ publicKey: z.string().max(200) }).optional(),
});

export class CreatedOrderDto extends createZodDto(CreatedOrderSchema) {}

/** Só o que o Brick devolve; número, validade ou CVV são recusados (chave a mais = 400). */
export const CardPaymentSchema = z.strictObject({
  cardToken: z.string().min(1).max(256),
  paymentMethodId: z.string().min(1).max(40),
  issuerId: z.string().max(40).nullish(),
  installments: z.int().min(1).max(12),
});

export class CardPaymentDto extends createZodDto(CardPaymentSchema) {}

export const PublicOrderSchema = z.object({
  orderId: z.uuid(),
  method: z.enum(ORDER_METHODS),
  status: z.enum(ORDER_STATUSES),
  totalCents: z.int(),
});

export class PublicOrderDto extends createZodDto(PublicOrderSchema) {}
