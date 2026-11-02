import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { GuestbookStatus } from '../../generated/prisma/enums';
import { SiteService } from '../site/site.service';
import { GuestbookDisabled, GuestbookMessageNotFound } from './errors/guestbook-errors';
import { type GuestbookMessageRecord, GuestbookRepository } from './guestbook.repository';

const PAGE_SIZE = 50;
const isUuid = (value: string) => z.uuid().safeParse(value).success;

export interface GuestbookPage {
  items: GuestbookMessageRecord[];
  nextCursor: string | null;
}

function toPage(rows: GuestbookMessageRecord[]): GuestbookPage {
  const items = rows.slice(0, PAGE_SIZE);
  return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null };
}

/**
 * Mural de recados (spec 013): envio limitado por IP, lista pública só de aprovados e moderação
 * por status, sem exclusão (ADR-001). O site responde antes de tudo se o mural está ativo (ADR-002).
 */
@Injectable()
export class GuestbookService {
  constructor(
    private readonly repository: GuestbookRepository,
    private readonly site: SiteService,
  ) {}

  /** Grava PENDING só com o mural publicado (RF02, RF05); o limite por IP fica no controller. */
  async post(
    weddingId: string,
    message: { authorName: string; body: string },
  ): Promise<GuestbookMessageRecord> {
    await this.assertEnabled(weddingId);
    return this.repository.create(weddingId, message);
  }

  /** Só aprovados, do mais recente ao mais antigo (RF06). */
  async listApproved(weddingId: string, cursor: string | undefined): Promise<GuestbookPage> {
    await this.assertEnabled(weddingId);
    return toPage(await this.repository.listPage(weddingId, 'APPROVED', cursor, PAGE_SIZE));
  }

  /** Uma aba do painel, com a quantidade de pendentes (RF07). */
  async listForPanel(
    weddingId: string,
    status: GuestbookStatus,
    cursor: string | undefined,
  ): Promise<GuestbookPage & { pendingCount: number }> {
    const [rows, pendingCount] = await Promise.all([
      this.repository.listPage(weddingId, status, cursor, PAGE_SIZE),
      this.repository.countPending(weddingId),
    ]);
    return { ...toPage(rows), pendingCount };
  }

  /** Qualquer recado vai a APPROVED, REJECTED ou HIDDEN (RF08, RF09). */
  async moderate(
    weddingId: string,
    messageId: string,
    status: Exclude<GuestbookStatus, 'PENDING'>,
  ): Promise<GuestbookMessageRecord> {
    const message = isUuid(messageId)
      ? await this.repository.setStatus(weddingId, messageId, status)
      : null;
    if (!message) throw new GuestbookMessageNotFound();
    return message;
  }

  private async assertEnabled(weddingId: string): Promise<void> {
    if (!(await this.site.isPublishedSectionEnabled(weddingId, 'guestbook'))) {
      throw new GuestbookDisabled();
    }
  }
}
