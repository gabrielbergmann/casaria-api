import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../../common/time/clock';
import { isPostWedding } from '../../weddings/post-wedding';
import { WeddingsService } from '../../weddings/weddings.service';
import { ContributionNotFound, ContributionThanksNotOpen } from '../errors/payment-errors';
import { ReceivedGiftsService } from './received-gifts.service';

const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Lista reduzida do editor: sem valor, taxa, mensagem, email nem CPF (spec 014 RF09). */
export interface ThankListItem {
  orderId: string;
  giftTitle: string;
  giver: string;
  thanked: boolean;
}

/**
 * Agradecido (spec 014 RF07 a RF09): owner e editor marcam e desmarcam só depois da data do
 * casamento, lida a cada requisição (ADR-001); tudo passa pelo ReceivedGiftsService da 012.
 */
@Injectable()
export class ThanksService {
  constructor(
    private readonly received: ReceivedGiftsService,
    private readonly weddings: WeddingsService,
    private readonly clock: Clock,
  ) {}

  mark(weddingId: string, orderId: string): Promise<void> {
    return this.setThanked(weddingId, orderId, true);
  }

  unmark(weddingId: string, orderId: string): Promise<void> {
    return this.setThanked(weddingId, orderId, false);
  }

  /** Visão do editor, com a data do casamento para o painel habilitar a caixa. */
  async listForEditor(weddingId: string): Promise<{ weddingDate: Date; items: ThankListItem[] }> {
    const [{ weddingDate }, received] = await Promise.all([
      this.weddings.getDetails(weddingId),
      this.received.list(weddingId),
    ]);
    const items = received.map(({ orderId, giftTitle, giver, thankedAt }) => ({
      orderId,
      giftTitle,
      giver,
      thanked: thankedAt !== null,
    }));
    return { weddingDate, items };
  }

  private async setThanked(weddingId: string, orderId: string, thanked: boolean): Promise<void> {
    const now = this.clock.now();
    const { weddingDate } = await this.weddings.getDetails(weddingId);
    if (!isPostWedding(weddingDate, now)) throw new ContributionThanksNotOpen();
    const changed =
      isUuid(orderId) && (await this.received.setThanked(weddingId, orderId, thanked ? now : null));
    if (!changed) throw new ContributionNotFound();
  }
}
