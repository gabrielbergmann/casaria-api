import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../common/time/clock';
import { assertBeforeDeadline } from './deadline';
import { OpenRsvpResponseNotFound, RsvpOpenModeDisabled } from './errors/rsvp-errors';
import { type NewOpenResponse, OpenRsvpRepository } from './open-rsvp.repository';
import { RsvpService } from './rsvp.service';

const PAGE_SIZE = 50;
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * Modo aberto (spec 010 RF09): visitante sem convite, numa tabela separada e sem edição. O modo e
 * o prazo são conferidos antes de qualquer escrita; o limite por IP fica no controller.
 */
@Injectable()
export class OpenRsvpService {
  constructor(
    private readonly repository: OpenRsvpRepository,
    private readonly rsvp: RsvpService,
    private readonly clock: Clock,
  ) {}

  async answer(weddingId: string, response: NewOpenResponse): Promise<void> {
    const settings = await this.rsvp.getSettings(weddingId);
    if (!settings.openModeEnabled) throw new RsvpOpenModeDisabled();
    assertBeforeDeadline(settings.deadline, this.clock.now());
    await this.repository.create(weddingId, response);
  }

  async list(weddingId: string, page: number) {
    const result = await this.repository.listPage(weddingId, (page - 1) * PAGE_SIZE, PAGE_SIZE);
    return { ...result, page, pageSize: PAGE_SIZE };
  }

  async delete(weddingId: string, responseId: string): Promise<void> {
    if (!isUuid(responseId) || !(await this.repository.delete(weddingId, responseId))) {
      throw new OpenRsvpResponseNotFound();
    }
  }
}
