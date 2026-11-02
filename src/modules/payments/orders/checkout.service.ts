import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { maskCpf } from '../../../common/personal-data/cpf';
import { Clock } from '../../../common/time/clock';
import type { OrderStatus, PaymentMethod } from '../../../generated/prisma/enums';
import { TransactionRunner } from '../../../infra/prisma/transaction-runner';
import { GiftInvalidAmount } from '../../gifts/errors/gift-errors';
import { type CheckoutRequest, GiftsService } from '../../gifts/gifts.service';
import { PaymentAccountsService } from '../accounts/payment-accounts.service';
import type { CreateOrderInput } from '../dto/payments.dto';
import {
  PaymentChargeFailed,
  PaymentOrderNotFound,
  PaymentOrderNotPending,
} from '../errors/payment-errors';
import { calculateCharge, type Charge, type FeeConfig } from '../fees/fee-calculator';
import type { FeeTable } from '../fees/payment-fees.repository';
import { PaymentFeesService } from '../fees/payment-fees.service';
import { PixKeysService } from '../pix/pix-keys.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PixCharge,
  type ProviderPayment,
} from '../provider/payment-provider';
import { OrderTransitionsService } from './order-transitions.service';
import { type OrderRecord, OrdersRepository } from './orders.repository';

/** Reserva de cotas e expiração do Pix (PRD RF23, RF27). */
export const RESERVATION_MINUTES = 30;
const MAX_CENTS = 2_147_483_647;
/** O Pix direto não passa por gateway (spec 017 RF04). */
const NO_FEE: FeeConfig = { percentBps: 0, fixedCents: 0 };

export interface Quote {
  priceCents: number;
  pix: Omit<Charge, 'priceCents'>;
  card: Omit<Charge, 'priceCents'>;
}

export interface CreatedOrder {
  orderId: string;
  method: PaymentMethod;
  status: OrderStatus;
  priceCents: number;
  feeCents: number;
  totalCents: number;
  reservationExpiresAt: Date;
  payerCpfMasked: string;
  /** direct: Pix na chave do casal (spec 017), sem QR pronto: o site desenha do copia e cola. */
  pix?: { qrCode: string; qrCodeBase64: string | null; direct: boolean };
  card?: { publicKey: string };
}

/** Formas aceitas agora: Pix com chave ou conta, cartão só com conta (spec 017 RF05). */
export interface CheckoutAvailability {
  pix: boolean;
  card: boolean;
}

export interface CardPaymentInput {
  cardToken: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
}

const onlyFee = ({ feeCents, totalCents }: Charge) => ({ feeCents, totalCents });
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * Checkout do site sem login (spec 012 RF06 a RF10): preço, taxa e total do servidor; pedido e
 * reserva numa transação curta sem chamar o Mercado Pago; cobrança fora dela, com o id do pedido
 * como chave de idempotência.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly accounts: PaymentAccountsService,
    private readonly fees: PaymentFeesService,
    private readonly pixKeys: PixKeysService,
    private readonly gifts: GiftsService,
    private readonly orders: OrdersRepository,
    private readonly transitions: OrderTransitionsService,
    private readonly transactions: TransactionRunner,
    private readonly crypto: CryptoService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly clock: Clock,
    @InjectPinoLogger(CheckoutService.name) private readonly logger: PinoLogger,
  ) {}

  async availability(weddingId: string): Promise<CheckoutAvailability> {
    const [card, hasPixKey] = await Promise.all([
      this.accounts.isCheckoutAvailable(weddingId),
      this.pixKeys.hasKey(weddingId),
    ]);
    return { pix: card || hasPixKey, card };
  }

  /**
   * Passo 3: preço, taxa e total dos dois meios, calculados aqui (RF06); com chave Pix, o Pix
   * é direto e sem taxa (spec 017 RF04).
   */
  async quote(weddingId: string, giftId: string, request: CheckoutRequest): Promise<Quote> {
    const pixMethod = await this.pixMethod(weddingId);
    if (pixMethod === 'PIX') await this.accounts.getUsable(weddingId);
    const [price, fees] = await Promise.all([
      this.gifts.quoteForCheckout(weddingId, giftId, request),
      this.fees.get(weddingId),
    ]);
    return {
      priceCents: price.priceCents,
      pix: onlyFee(this.charge(price.priceCents, pixMethod, fees)),
      card: onlyFee(this.charge(price.priceCents, 'CARD', fees)),
    };
  }

  /**
   * Conta válida, reserva de 30 minutos e pedido PENDING com o CPF só cifrado (RF07); o limite
   * por IP fica no controller. Pix: cobra já e devolve QR e copia e cola. Cartão: devolve o total
   * e a public key do casal.
   */
  async createOrder(weddingId: string, input: CreateOrderInput): Promise<CreatedOrder> {
    const method = input.method === 'PIX' ? await this.pixMethod(weddingId) : input.method;
    const usable = method === 'PIX_DIRECT' ? null : await this.accounts.getUsable(weddingId);
    const fees = await this.fees.get(weddingId);
    const reservationExpiresAt = new Date(
      this.clock.now().getTime() + RESERVATION_MINUTES * 60_000,
    );

    const order = await this.transactions.run(async (tx) => {
      const price = await this.gifts.reserveForCheckout(
        weddingId,
        input.giftId,
        { quantity: input.quantity, amountCents: input.amountCents },
        tx,
      );
      return this.orders.createPending(
        weddingId,
        {
          giftId: price.giftId,
          quantity: price.quantity,
          ...this.charge(price.priceCents, method, fees),
          method,
          payerName: input.payer.name,
          payerEmail: input.payer.email,
          payerCpfEnc: this.crypto.encrypt(input.payer.cpf),
          message: input.message ?? null,
          isAnonymous: input.isAnonymous,
          reservationExpiresAt,
        },
        tx,
      );
    });

    const created = this.toCreated(order, maskCpf(input.payer.cpf));
    if (method === 'CARD') return { ...created, card: { publicKey: usable.publicKey } };
    if (method === 'PIX_DIRECT') {
      const qrCode = await this.pixKeys.buildCode(weddingId, order.id, order.totalCents);
      return { ...created, pix: { qrCode, qrCodeBase64: null, direct: true } };
    }

    let pix: PixCharge;
    try {
      pix = await this.provider.createPixCharge(usable.account, {
        orderId: order.id,
        totalCents: order.totalCents,
        payer: { name: input.payer.name, email: input.payer.email, cpf: input.payer.cpf },
        expiresInMinutes: RESERVATION_MINUTES,
      });
    } catch (err) {
      throw await this.failCharge(weddingId, order.id, err);
    }
    await this.orders.setProviderPayment(weddingId, order.id, pix.id, null);
    const status = await this.transitions.apply(weddingId, order.id, pix.status);
    return {
      ...created,
      status,
      pix: { qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64, direct: false },
    };
  }

  /** Cartão pelo Brick (RF09): só token, meio, emissor e parcelas; uma cobrança por pedido. */
  async payWithCard(
    weddingId: string,
    orderId: string,
    card: CardPaymentInput,
  ): Promise<{ orderId: string; status: OrderStatus }> {
    const order = await this.findOrder(weddingId, orderId);
    const open =
      order.method === 'CARD' &&
      order.status === 'PENDING' &&
      order.providerPaymentId === null &&
      order.payerEmail !== null && // anonimizado (spec 015): nunca vai ao Mercado Pago
      order.reservationExpiresAt > this.clock.now();
    if (!open) throw new PaymentOrderNotPending();
    const { account } = await this.accounts.getUsable(weddingId);

    let charge: ProviderPayment;
    try {
      charge = await this.provider.createCardCharge(account, {
        orderId: order.id,
        totalCents: order.totalCents,
        payerEmail: order.payerEmail,
        cardToken: card.cardToken,
        paymentMethodId: card.paymentMethodId,
        issuerId: card.issuerId,
        installments: card.installments,
      });
    } catch (err) {
      throw await this.failCharge(weddingId, order.id, err);
    }
    if (charge.failureReason) {
      this.logger.warn({ orderId: order.id, reason: charge.failureReason }, 'payment_card_refused');
    }
    await this.orders.setProviderPayment(weddingId, order.id, charge.id, card.installments);
    const status = await this.transitions.apply(weddingId, order.id, charge.status);
    return { orderId: order.id, status };
  }

  /**
   * "Já fiz o Pix" (spec 017 RF07, RF08): só no Pix direto pendente com a reserva valendo; o
   * pedido fica "A conferir" e as cotas reservadas até o casal decidir.
   */
  async declarePixSent(weddingId: string, orderId: string) {
    const order = await this.findOrder(weddingId, orderId);
    const open =
      order.method === 'PIX_DIRECT' &&
      order.status === 'PENDING' &&
      order.reservationExpiresAt > this.clock.now();
    if (!open) throw new PaymentOrderNotPending();
    const status = await this.transitions.apply(weddingId, order.id, 'AWAITING_CONFIRMATION');
    if (status !== 'AWAITING_CONFIRMATION') throw new PaymentOrderNotPending();
    return this.getPublicOrder(weddingId, order.id);
  }

  /** O site consulta o Pix a cada 5 segundos: só status e total, sem dado pessoal. */
  async getPublicOrder(weddingId: string, orderId: string) {
    const order = await this.findOrder(weddingId, orderId);
    return {
      orderId: order.id,
      method: order.method,
      status: order.status,
      totalCents: order.totalCents,
    };
  }

  private async findOrder(weddingId: string, orderId: string): Promise<OrderRecord> {
    const order = isUuid(orderId) ? await this.orders.find(weddingId, orderId) : null;
    if (!order) throw new PaymentOrderNotFound();
    return order;
  }

  /** Cobrança que falhou encerra o pedido como recusado e libera as cotas (RF10). */
  private async failCharge(weddingId: string, orderId: string, err: unknown) {
    this.logger.error({ err, orderId }, 'payment_charge_failed');
    await this.transitions.apply(weddingId, orderId, 'REJECTED');
    return new PaymentChargeFailed();
  }

  /** Com chave Pix, o Pix é direto na chave; sem ela, pelo Mercado Pago (spec 017 RF04). */
  private async pixMethod(weddingId: string): Promise<'PIX' | 'PIX_DIRECT'> {
    return (await this.pixKeys.hasKey(weddingId)) ? 'PIX_DIRECT' : 'PIX';
  }

  private charge(priceCents: number, method: PaymentMethod, fees: FeeTable): Charge {
    const fee = method === 'PIX_DIRECT' ? NO_FEE : fees[method];
    const charge = calculateCharge(priceCents, fee);
    if (charge.totalCents > MAX_CENTS) throw new GiftInvalidAmount();
    return charge;
  }

  private toCreated(order: OrderRecord, payerCpfMasked: string): CreatedOrder {
    return {
      orderId: order.id,
      method: order.method,
      status: order.status,
      priceCents: order.priceCents,
      feeCents: order.feeCents,
      totalCents: order.totalCents,
      reservationExpiresAt: order.reservationExpiresAt,
      payerCpfMasked,
    };
  }
}
