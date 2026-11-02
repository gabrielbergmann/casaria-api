import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Clock } from '../../../common/time/clock';
import { PaymentAccountsService } from '../accounts/payment-accounts.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderPayment,
  ProviderPaymentNotFound,
} from '../provider/payment-provider';
import { OrderTransitionsService } from './order-transitions.service';
import { OrdersRepository } from './orders.repository';

/** Conciliação olha os pedidos dos últimos 180 dias (RF13). */
const RECONCILE_WINDOW_MS = 180 * 24 * 60 * 60_000;

/**
 * Sincronização com o Mercado Pago (spec 012 RF11 e RF13): o status só muda depois de consultar
 * a cobrança com o token do casal; o corpo do webhook nunca é fonte de verdade.
 */
@Injectable()
export class OrderSyncService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly accounts: PaymentAccountsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly transitions: OrderTransitionsService,
    private readonly clock: Clock,
    @InjectPinoLogger(OrderSyncService.name) private readonly logger: PinoLogger,
  ) {}

  /** Erro do gateway sobe (o webhook responde 5xx e o Mercado Pago reenvia). */
  async sync(weddingId: string, orderId: string): Promise<void> {
    const order = await this.orders.find(weddingId, orderId);
    if (!order?.providerPaymentId) return;
    const usable = await this.accounts.findUsable(weddingId);
    if (!usable) {
      this.logger.warn({ orderId }, 'order_sync_without_account');
      return;
    }
    let payment: ProviderPayment;
    try {
      payment = await this.provider.getPayment(usable.account, order.providerPaymentId);
    } catch (err) {
      if (!(err instanceof ProviderPaymentNotFound)) throw err;
      this.logger.warn({ orderId }, 'order_payment_of_other_account');
      return;
    }
    // Cobrança da conta, mas de outro pedido: nada muda.
    if (payment.externalReference !== order.id) {
      this.logger.warn({ orderId }, 'order_payment_mismatch');
      return;
    }
    await this.transitions.apply(weddingId, orderId, payment.status);
  }

  /**
   * Rotina de 5 minutos (ADR-001 da 012): pedido pendente com a reserva vencida expira e libera as
   * cotas; com cobrança, consulta o Mercado Pago antes.
   */
  async expireReservations(weddingId: string): Promise<void> {
    for (const order of await this.orders.listExpiredPending(weddingId, this.clock.now())) {
      try {
        if (order.providerPaymentId) await this.sync(weddingId, order.id);
        const current = await this.orders.find(weddingId, order.id);
        if (current?.status === 'PENDING') {
          await this.transitions.apply(weddingId, order.id, 'EXPIRED');
        }
      } catch (err) {
        this.logger.error({ err, orderId: order.id }, 'order_expiration_failed');
      }
    }
  }

  /** Rotina diária: consulta os pedidos com cobrança dos últimos 180 dias (RF13). */
  async reconcile(weddingId: string): Promise<void> {
    const since = new Date(this.clock.now().getTime() - RECONCILE_WINDOW_MS);
    for (const order of await this.orders.listToReconcile(weddingId, since)) {
      try {
        await this.sync(weddingId, order.id);
      } catch (err) {
        this.logger.error({ err, orderId: order.id }, 'order_reconciliation_failed');
      }
    }
  }
}
