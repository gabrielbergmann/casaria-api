import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { forEachWedding } from '../../../common/tenant/for-each-wedding';
import { WeddingsService } from '../../weddings/weddings.service';
import { PaymentAccountsService } from '../accounts/payment-accounts.service';
import { OrderSyncService } from '../orders/order-sync.service';

const TIME_ZONE = 'America/Sao_Paulo';

/**
 * Rotinas de pagamentos (spec 012 RF13, PRD ADR-006): casamento a casamento, com a falha de um
 * isolada, e idempotentes (podem rodar em mais de uma instância).
 */
@Injectable()
export class PaymentRoutines {
  constructor(
    private readonly weddings: WeddingsService,
    private readonly accounts: PaymentAccountsService,
    private readonly orders: OrderSyncService,
    @InjectPinoLogger(PaymentRoutines.name) private readonly logger: PinoLogger,
  ) {}

  /** Reservas vencidas liberadas a cada 5 minutos (ADR-001 da 012). */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'payments-expire-reservations' })
  async expireReservations(): Promise<void> {
    await this.forEach((weddingId) => this.orders.expireReservations(weddingId));
  }

  /** Tokens que vencem em até 30 dias, uma vez por dia. */
  @Cron('0 3 * * *', { name: 'payments-renew-tokens', timeZone: TIME_ZONE })
  async renewTokens(): Promise<void> {
    await this.forEach((weddingId) => this.accounts.renewIfDue(weddingId));
  }

  /** Conciliação dos pedidos dos últimos 180 dias, uma vez por dia. */
  @Cron('30 3 * * *', { name: 'payments-reconcile', timeZone: TIME_ZONE })
  async reconcile(): Promise<void> {
    await this.forEach((weddingId) => this.orders.reconcile(weddingId));
  }

  private async forEach(task: (weddingId: string) => Promise<void>): Promise<void> {
    await forEachWedding(await this.weddings.listIds(), task, this.logger);
  }
}
