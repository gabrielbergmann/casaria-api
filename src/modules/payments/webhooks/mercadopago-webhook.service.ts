import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Clock } from '../../../common/time/clock';
import { PaymentAccountsService } from '../accounts/payment-accounts.service';
import { PaymentInvalidSignature, PaymentOrderNotFound } from '../errors/payment-errors';
import { OrderSyncService } from '../orders/order-sync.service';
import { OrdersRepository } from '../orders/orders.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../provider/payment-provider';
import { WebhookEventsRepository } from './webhook-events.repository';

/** O que a rota lê da notificação: cabeçalhos, query e, do corpo, só o tipo e a ação. */
export interface MercadoPagoNotification {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  type: string | undefined;
  action: string | undefined;
  /** Vendedor do aviso de vinculação (mp-connect). */
  userId: string | undefined;
}

/**
 * Notificações do Mercado Pago na própria requisição (spec 012 RF11, RF12, RF03). Na Orders API
 * a URL é uma só, configurada na aplicação: o pedido é achado pela cobrança e a conta, pelo
 * usuário do Mercado Pago (ADR-002 da 012, ajustado na execução).
 */
@Injectable()
export class MercadoPagoWebhookService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orders: OrdersRepository,
    private readonly events: WebhookEventsRepository,
    private readonly sync: OrderSyncService,
    private readonly accounts: PaymentAccountsService,
    private readonly clock: Clock,
    @InjectPinoLogger(MercadoPagoWebhookService.name) private readonly logger: PinoLogger,
  ) {}

  async handle(notification: MercadoPagoNotification): Promise<void> {
    const { signature, requestId, dataId, type } = notification;
    if (
      !this.provider.verifyWebhookSignature({ signature, requestId, dataId, now: this.clock.now() })
    ) {
      this.logger.warn({ requestId, type }, 'webhook_invalid_signature');
      throw new PaymentInvalidSignature();
    }
    if (type === 'order') return this.handleOrder(dataId, requestId);
    if (type === 'mp-connect' && notification.action === 'application.deauthorized') {
      return this.accounts.handleDeauthorization(notification.userId ?? dataId);
    }
    this.logger.info({ requestId, type, action: notification.action }, 'webhook_ignored');
  }

  /** Evento registrado uma vez; já processado responde 200 sem repetir (RF11). */
  private async handleOrder(dataId: string, requestId: string): Promise<void> {
    const order = await this.orders.findByProviderPaymentId(dataId);
    if (!order) {
      // Cobrança ainda sem id gravado (aviso mais rápido que a resposta): 404 faz o reenvio.
      this.logger.warn({ requestId }, 'webhook_order_unknown');
      throw new PaymentOrderNotFound();
    }
    const event = await this.events.register(order.weddingId, {
      requestId,
      topic: 'order',
      dataId,
    });
    if (event.processedAt) return;
    await this.sync.sync(order.weddingId, order.id);
    await this.events.markProcessed(order.weddingId, event.id, this.clock.now());
  }
}
