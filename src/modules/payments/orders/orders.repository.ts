import { Injectable } from '@nestjs/common';
import type { OrderStatus, PaymentMethod } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { Tx } from '../../../infra/prisma/transaction-runner';

export interface OrderRecord {
  id: string;
  giftId: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  totalCents: number;
  method: PaymentMethod;
  status: OrderStatus;
  /** Nulo depois da anonimização (spec 015). */
  payerEmail: string | null;
  reservationExpiresAt: Date;
  providerPaymentId: string | null;
}

export interface NewOrder {
  giftId: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  totalCents: number;
  method: PaymentMethod;
  payerName: string;
  payerEmail: string;
  payerCpfEnc: string;
  message: string | null;
  isAnonymous: boolean;
  reservationExpiresAt: Date;
}

/** Linha de Recebidos: sem CPF nem email (spec 012 RF14). */
export interface ReceivedOrderRecord {
  id: string;
  giftId: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  method: PaymentMethod;
  payerName: string;
  isAnonymous: boolean;
  message: string | null;
  status: OrderStatus;
  approvedAt: Date;
  thankedAt: Date | null;
}

/** Pix direto esperando o casal conferir (spec 017 RF09): sem CPF nem email. */
export interface AwaitingOrderRecord {
  id: string;
  giftId: string;
  quantity: number;
  priceCents: number;
  payerName: string;
  isAnonymous: boolean;
  message: string | null;
  createdAt: Date;
}

const ORDER = {
  id: true,
  giftId: true,
  quantity: true,
  priceCents: true,
  feeCents: true,
  totalCents: true,
  method: true,
  status: true,
  payerEmail: true,
  reservationExpiresAt: true,
  providerPaymentId: true,
} as const;

export const ANONYMIZED_PAYER_NAME = 'Pagador anonimizado';

// Pedidos (spec 012). Todo método recebe o weddingId e filtra por ele (RNF01), exceto o achado
// pela cobrança do Mercado Pago, exceção documentada no ADR-002 da 012.
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPending(weddingId: string, data: NewOrder, tx: Tx): Promise<OrderRecord> {
    return tx.order.create({ data: { ...data, weddingId, status: 'PENDING' }, select: ORDER });
  }

  find(weddingId: string, orderId: string, db: Tx = this.prisma): Promise<OrderRecord | null> {
    return db.order.findFirst({ where: { id: orderId, weddingId }, select: ORDER });
  }

  /** No máximo uma cobrança por pedido: grava só se ainda não houver (RF09). */
  async setProviderPayment(
    weddingId: string,
    orderId: string,
    providerPaymentId: string,
    installments: number | null,
  ): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, weddingId, providerPaymentId: null },
      data: { providerPaymentId, installments },
    });
    return count === 1;
  }

  /** UPDATE ... WHERE status = de: quem chegar depois não repete o efeito (skill pagamentos §9). */
  async transition(
    weddingId: string,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    approvedAt: Date | null,
    tx: Tx,
  ): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, weddingId, status: from },
      data: { status: to, ...(approvedAt ? { approvedAt } : {}) },
    });
    return count === 1;
  }

  /** Pendentes com a reserva vencida (rotina de 5 minutos, ADR-001 da 012). */
  listExpiredPending(weddingId: string, now: Date): Promise<OrderRecord[]> {
    return this.prisma.order.findMany({
      where: { weddingId, status: 'PENDING', reservationExpiresAt: { lt: now } },
      select: ORDER,
    });
  }

  /** Com cobrança, ainda abertos ou aprovados, criados desde `since` (conciliação, RF13). */
  listToReconcile(weddingId: string, since: Date): Promise<OrderRecord[]> {
    return this.prisma.order.findMany({
      where: {
        weddingId,
        providerPaymentId: { not: null },
        status: { in: ['PENDING', 'IN_PROCESS', 'APPROVED'] },
        createdAt: { gte: since },
      },
      select: ORDER,
    });
  }

  /** Os que chegaram a aprovado, do mais recente ao mais antigo (RF14). */
  listReceived(weddingId: string): Promise<ReceivedOrderRecord[]> {
    return this.prisma.order.findMany({
      where: { weddingId, approvedAt: { not: null } },
      select: {
        id: true,
        giftId: true,
        quantity: true,
        priceCents: true,
        feeCents: true,
        method: true,
        payerName: true,
        isAnonymous: true,
        message: true,
        status: true,
        approvedAt: true,
        thankedAt: true,
      },
      orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** Pix direto declarado pelo convidado, do mais antigo ao mais recente (spec 017 RF09). */
  listAwaiting(weddingId: string): Promise<AwaitingOrderRecord[]> {
    return this.prisma.order.findMany({
      where: { weddingId, status: 'AWAITING_CONFIRMATION' },
      select: {
        id: true,
        giftId: true,
        quantity: true,
        priceCents: true,
        payerName: true,
        isAnonymous: true,
        message: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Agradecido (spec 014): só em pedido que chegou a aprovado; marcar de novo mantém o primeiro
   * instante (RF07). False quando o pedido não é presente recebido do casamento.
   */
  async setThanked(weddingId: string, orderId: string, thankedAt: Date | null): Promise<boolean> {
    const received = { id: orderId, weddingId, approvedAt: { not: null } };
    const { count } = await this.prisma.order.updateMany({
      where: thankedAt ? { ...received, thankedAt: null } : received,
      data: { thankedAt },
    });
    if (count === 1 || !thankedAt) return count === 1;
    const order = await this.prisma.order.findFirst({ where: received, select: { id: true } });
    return order !== null;
  }

  /**
   * Anonimização dos pagadores (spec 015): nome trocado, email e CPF cifrado nulos, sem apagar
   * pedidos; valores, status, mensagem e agradecido ficam.
   */
  async anonymizePayers(weddingId: string): Promise<void> {
    await this.prisma.order.updateMany({
      where: { weddingId },
      data: { payerName: ANONYMIZED_PAYER_NAME, payerEmail: null, payerCpfEnc: null },
    });
  }

  /** Exceção à regra do weddingId (ADR-002 da 012): a notificação só traz o id da cobrança. */
  findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<{ id: string; weddingId: string } | null> {
    return this.prisma.order.findFirst({
      where: { providerPaymentId: { equals: providerPaymentId, mode: 'insensitive' } },
      select: { id: true, weddingId: true },
    });
  }
}
