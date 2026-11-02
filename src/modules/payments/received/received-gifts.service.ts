import { Injectable } from '@nestjs/common';
import type { OrderStatus, PaymentMethod } from '../../../generated/prisma/enums';
import { GiftsService } from '../../gifts/gifts.service';
import { OrdersRepository } from '../orders/orders.repository';

export const ANONYMOUS_GIVER = 'Anônimo';

export interface ReceivedGift {
  orderId: string;
  giftTitle: string;
  quantity: number;
  giver: string;
  amountCents: number;
  feeCents: number;
  method: PaymentMethod;
  message: string | null;
  status: OrderStatus;
  approvedAt: Date;
  thankedAt: Date | null;
}

/** Pix direto "A conferir" (spec 017 RF09). */
export interface AwaitingGift {
  orderId: string;
  giftTitle: string;
  quantity: number;
  giver: string;
  amountCents: number;
  message: string | null;
  createdAt: Date;
}

/**
 * Recebidos (spec 012 RF14) e agradecido, exportados para a spec 014: pedidos que chegaram a
 * aprovado, com o título do presente (mesmo excluído) e sem CPF nem email.
 */
@Injectable()
export class ReceivedGiftsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly gifts: GiftsService,
  ) {}

  async list(weddingId: string): Promise<ReceivedGift[]> {
    const rows = await this.orders.listReceived(weddingId);
    const titles = await this.gifts.getTitles(
      weddingId,
      rows.map((row) => row.giftId),
    );
    return rows.map((row) => ({
      orderId: row.id,
      giftTitle: titles[row.giftId] ?? '',
      quantity: row.quantity,
      giver: row.isAnonymous ? ANONYMOUS_GIVER : row.payerName,
      amountCents: row.priceCents,
      feeCents: row.feeCents,
      method: row.method,
      message: row.message,
      status: row.status,
      approvedAt: row.approvedAt,
      thankedAt: row.thankedAt,
    }));
  }

  async listAwaiting(weddingId: string): Promise<AwaitingGift[]> {
    const rows = await this.orders.listAwaiting(weddingId);
    const titles = await this.gifts.getTitles(
      weddingId,
      rows.map((row) => row.giftId),
    );
    return rows.map((row) => ({
      orderId: row.id,
      giftTitle: titles[row.giftId] ?? '',
      quantity: row.quantity,
      giver: row.isAnonymous ? ANONYMOUS_GIVER : row.payerName,
      amountCents: row.priceCents,
      message: row.message,
      createdAt: row.createdAt,
    }));
  }

  /** Marca ou desmarca agradecido; a regra da data do casamento é da spec 014. */
  setThanked(weddingId: string, orderId: string, thankedAt: Date | null): Promise<boolean> {
    return this.orders.setThanked(weddingId, orderId, thankedAt);
  }
}
