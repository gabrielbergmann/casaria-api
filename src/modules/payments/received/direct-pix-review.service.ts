import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { type AuditAction, AuditService } from '../../../common/audit/audit.service';
import { PaymentOrderNotAwaiting, PaymentOrderNotFound } from '../errors/payment-errors';
import { OrderTransitionsService } from '../orders/order-transitions.service';
import { OrdersRepository } from '../orders/orders.repository';

const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * Conferência do Pix direto pelo owner (spec 017 RF10, RF11): confirmar aprova e vende as
 * cotas; "Não recebi" recusa e libera. Só a partir de "A conferir", com auditoria.
 */
@Injectable()
export class DirectPixReviewService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly transitions: OrderTransitionsService,
    private readonly audit: AuditService,
  ) {}

  confirm(weddingId: string, orderId: string, actorUserId: string): Promise<void> {
    return this.decide(
      weddingId,
      orderId,
      actorUserId,
      'APPROVED',
      'payments.direct_pix_confirmed',
    );
  }

  markNotReceived(weddingId: string, orderId: string, actorUserId: string): Promise<void> {
    return this.decide(
      weddingId,
      orderId,
      actorUserId,
      'REJECTED',
      'payments.direct_pix_not_received',
    );
  }

  private async decide(
    weddingId: string,
    orderId: string,
    actorUserId: string,
    next: 'APPROVED' | 'REJECTED',
    action: AuditAction,
  ): Promise<void> {
    const order = isUuid(orderId) ? await this.orders.find(weddingId, orderId) : null;
    if (!order) throw new PaymentOrderNotFound();
    if (order.status !== 'AWAITING_CONFIRMATION') throw new PaymentOrderNotAwaiting();
    if ((await this.transitions.apply(weddingId, order.id, next)) !== next) {
      throw new PaymentOrderNotAwaiting();
    }
    await this.audit.record({ action, actorUserId, weddingId, metadata: { orderId: order.id } });
  }
}
