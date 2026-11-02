import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { assertValidFee, DEFAULT_FEE, type FeeConfig } from './fee-calculator';
import {
  type FeeTable,
  type GatewayMethod,
  PaymentFeesRepository,
} from './payment-fees.repository';

const sameFee = (a: FeeConfig, b: FeeConfig) =>
  a.percentBps === b.percentBps && a.fixedCents === b.fixedCents;

/** Taxas de Pix e cartão do casamento: sem linha, vale o padrão (RF05). Só o owner altera. */
@Injectable()
export class PaymentFeesService {
  constructor(
    private readonly repository: PaymentFeesRepository,
    private readonly audit: AuditService,
  ) {}

  async get(weddingId: string): Promise<FeeTable> {
    const rows = await this.repository.list(weddingId);
    const find = (method: GatewayMethod) => {
      const row = rows.find((fee) => fee.method === method);
      return row ? { percentBps: row.percentBps, fixedCents: row.fixedCents } : DEFAULT_FEE;
    };
    return { PIX: find('PIX'), CARD: find('CARD') };
  }

  /** Valida, grava e audita o valor anterior e o novo (PRD RF40). */
  async save(weddingId: string, fees: FeeTable, actorUserId: string): Promise<FeeTable> {
    assertValidFee(fees.PIX);
    assertValidFee(fees.CARD);
    const before = await this.get(weddingId);
    if (sameFee(before.PIX, fees.PIX) && sameFee(before.CARD, fees.CARD)) return before;
    await this.repository.saveAll(weddingId, fees);
    await this.audit.record({
      action: 'payments.fees_changed',
      actorUserId,
      weddingId,
      metadata: {
        pixPercentBpsBefore: before.PIX.percentBps,
        pixFixedCentsBefore: before.PIX.fixedCents,
        cardPercentBpsBefore: before.CARD.percentBps,
        cardFixedCentsBefore: before.CARD.fixedCents,
        pixPercentBps: fees.PIX.percentBps,
        pixFixedCents: fees.PIX.fixedCents,
        cardPercentBps: fees.CARD.percentBps,
        cardFixedCents: fees.CARD.fixedCents,
      },
    });
    return fees;
  }
}
