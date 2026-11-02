import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { isUniqueViolation } from '../../../infra/prisma/unique-violation';

export interface WebhookEventRecord {
  id: string;
  processedAt: Date | null;
}

const EVENT = { id: true, processedAt: true } as const;

// Avisos do Mercado Pago já recebidos (spec 012 RF11), únicos pelo x-request-id; sem o corpo.
@Injectable()
export class WebhookEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma vez; o mesmo x-request-id devolve o registro existente. */
  async register(
    weddingId: string,
    event: { requestId: string; topic: string; dataId: string },
  ): Promise<WebhookEventRecord> {
    try {
      return await this.prisma.webhookEvent.create({
        data: { weddingId, ...event },
        select: EVENT,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.webhookEvent.findFirstOrThrow({
        where: { weddingId, requestId: event.requestId },
        select: EVENT,
      });
    }
  }

  async markProcessed(weddingId: string, eventId: string, now: Date): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { id: eventId, weddingId },
      data: { processedAt: now },
    });
  }
}
