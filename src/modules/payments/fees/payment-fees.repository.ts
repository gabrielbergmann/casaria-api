import { Injectable } from '@nestjs/common';
import type { PaymentMethod } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { FeeConfig } from './fee-calculator';

/** Meios com taxa: o Pix direto (spec 017) não tem. */
export type GatewayMethod = Exclude<PaymentMethod, 'PIX_DIRECT'>;

export type FeeTable = Record<GatewayMethod, FeeConfig>;

// Taxas por casamento e meio (spec 012 RF05). Todo método filtra pelo weddingId (RNF01).
@Injectable()
export class PaymentFeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(weddingId: string): Promise<({ method: PaymentMethod } & FeeConfig)[]> {
    return this.prisma.paymentFee.findMany({
      where: { weddingId },
      select: { method: true, percentBps: true, fixedCents: true },
    });
  }

  /** Grava os dois meios juntos. */
  async saveAll(weddingId: string, fees: FeeTable): Promise<void> {
    await this.prisma.$transaction(
      (Object.keys(fees) as GatewayMethod[]).map((method) =>
        this.prisma.paymentFee.upsert({
          where: { weddingId_method: { weddingId, method } },
          create: { weddingId, method, ...fees[method] },
          update: fees[method],
        }),
      ),
    );
  }
}
