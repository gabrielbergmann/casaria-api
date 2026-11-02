import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Clock } from '../../../common/time/clock';
import type { OrderStatus } from '../../../generated/prisma/enums';
import { TransactionRunner, type Tx } from '../../../infra/prisma/transaction-runner';
import { GiftsService } from '../../gifts/gifts.service';
import { canTransition, quotaEffect } from './order-transitions';
import { type OrderRecord, OrdersRepository } from './orders.repository';

/**
 * Transições do pedido (tabela da spec 012): status e cotas na mesma transação, por UPDATE
 * condicional. Repetido não tem efeito; fora da tabela é ignorado e logado com os ids.
 */
@Injectable()
export class OrderTransitionsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly gifts: GiftsService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    @InjectPinoLogger(OrderTransitionsService.name) private readonly logger: PinoLogger,
  ) {}

  /** Devolve o status do pedido depois da tentativa (null = pedido inexistente). */
  apply(weddingId: string, orderId: string, next: OrderStatus | null): Promise<OrderStatus | null> {
    return this.transactions.run(async (tx) => {
      const order = await this.orders.find(weddingId, orderId, tx);
      if (!order) return null;
      if (next === null) {
        this.logger.warn({ orderId, from: order.status }, 'order_status_unknown');
        return order.status;
      }
      if (order.status === next) return next;
      if (!canTransition(order.status, next)) {
        this.logger.warn({ orderId, from: order.status, to: next }, 'order_transition_ignored');
        return order.status;
      }
      const approvedAt = next === 'APPROVED' ? this.clock.now() : null;
      if (!(await this.orders.transition(weddingId, orderId, order.status, next, approvedAt, tx))) {
        // Outra requisição aplicou antes: o efeito já aconteceu lá.
        return (await this.orders.find(weddingId, orderId, tx))?.status ?? null;
      }
      await this.applyQuotaEffect(weddingId, order, next, tx);
      this.logger.info({ orderId, from: order.status, to: next }, 'order_status_changed');
      return next;
    });
  }

  private async applyQuotaEffect(weddingId: string, order: OrderRecord, to: OrderStatus, tx: Tx) {
    const effect = quotaEffect(to);
    if (effect === 'confirm') {
      await this.gifts.confirmQuotas(weddingId, order.giftId, order.quantity, tx);
    } else if (effect === 'release_reserved') {
      await this.gifts.releaseReservation(weddingId, order.giftId, order.quantity, tx);
    } else if (effect === 'release_sold') {
      await this.gifts.releaseSold(weddingId, order.giftId, order.quantity, tx);
    }
  }
}
