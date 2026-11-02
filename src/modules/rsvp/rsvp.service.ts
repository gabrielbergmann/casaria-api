import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { TransactionRunner } from '../../infra/prisma/transaction-runner';
import { InvitationNotFound } from '../guests/errors/invitation-not-found';
import { GuestsService } from '../guests/guests.service';
import type { InvitationRecord } from '../guests/invitations.repository';
import { assertCompleteAnswer, type CompanionAnswer, type GuestAnswer } from './answers';
import { CodeAttempts } from './code-attempts';
import { assertBeforeDeadline, isDeadlinePassed } from './deadline';
import { RsvpRepository, type RsvpSettingsRecord } from './rsvp.repository';

/** Sem linha em rsvp_settings: modo aberto desligado e sem prazo (RF01). */
const DEFAULT_SETTINGS: RsvpSettingsRecord = { openModeEnabled: false, deadline: null };

export interface PublicRsvpStatus extends RsvpSettingsRecord {
  deadlinePassed: boolean;
}

/** Pessoa do convite como o site vê: a resposta sem contato e sem o texto da restrição. */
export interface RsvpPersonView {
  id: string;
  name: string;
  isChild: boolean;
  origin: 'LIST' | 'COMPANION';
  status: 'CONFIRMED' | 'DECLINED' | null;
  hasDietaryNotes: boolean;
  message: string | null;
}

export interface InvitationRsvpView {
  token: string;
  label: string;
  maxCompanions: number;
  deadline: Date | null;
  guests: RsvpPersonView[];
}

export type IdentifyInput =
  { token: string; code?: undefined } | { code: string; token?: undefined };

export interface InvitationAnswerInput {
  token: string;
  answers: GuestAnswer[];
  companions: CompanionAnswer[];
}

/**
 * Configuração do RSVP e resposta dos convites pelo site (spec 010). O casamento vem sempre do
 * guard (PublicTenantGuard ou WeddingMemberGuard); o convite, do token ou do código.
 */
@Injectable()
export class RsvpService {
  constructor(
    private readonly repository: RsvpRepository,
    private readonly guests: GuestsService,
    private readonly attempts: CodeAttempts,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async getSettings(weddingId: string): Promise<RsvpSettingsRecord> {
    return (await this.repository.findSettings(weddingId)) ?? DEFAULT_SETTINGS;
  }

  async saveSettings(weddingId: string, settings: RsvpSettingsRecord): Promise<RsvpSettingsRecord> {
    await this.repository.saveSettings(weddingId, settings);
    return settings;
  }

  async getPublicStatus(weddingId: string): Promise<PublicRsvpStatus> {
    const settings = await this.getSettings(weddingId);
    return { ...settings, deadlinePassed: isDeadlinePassed(settings.deadline, this.clock.now()) };
  }

  /**
   * Token do link ou código digitado (RF02 a RF04). Inexistente, de outro casamento ou
   * regenerado: o mesmo invitation.not_found. Só o erro de código conta para o bloqueio do IP.
   */
  async identify(weddingId: string, input: IdentifyInput, ip: string): Promise<InvitationRsvpView> {
    const invitation =
      input.token !== undefined
        ? await this.guests.identifyByToken(weddingId, input.token)
        : await this.identifyByCode(weddingId, input.code, ip);
    if (!invitation) throw new InvitationNotFound();
    return this.view(weddingId, invitation);
  }

  /** Estado completo do convite numa transação: acompanhantes e respostas (ADR-001). */
  async answerInvitation(weddingId: string, input: InvitationAnswerInput) {
    const now = this.clock.now();
    assertBeforeDeadline((await this.getSettings(weddingId)).deadline, now);
    const invitation = await this.guests.identifyByToken(weddingId, input.token);
    if (!invitation) throw new InvitationNotFound();
    assertCompleteAnswer(invitation, input.answers, input.companions);

    await this.transactions.run(async (tx) => {
      const companionIds = await this.guests.syncCompanions(
        weddingId,
        invitation.id,
        input.companions,
        tx,
      );
      const companionAnswers = input.companions.map(({ dietaryNotes, message }, index) => ({
        guestId: companionIds[index],
        status: 'CONFIRMED' as const,
        dietaryNotes,
        message,
      }));
      await this.repository.saveAnswers(
        weddingId,
        [...input.answers, ...companionAnswers],
        now,
        tx,
      );
    });

    const saved = await this.guests.identifyByToken(weddingId, input.token);
    return this.view(weddingId, saved ?? invitation);
  }

  private async identifyByCode(weddingId: string, code: string, ip: string) {
    await this.attempts.assertNotBlocked(ip);
    const invitation = await this.guests.identifyByCode(weddingId, code);
    if (!invitation) await this.attempts.registerFailure(ip);
    return invitation;
  }

  private async view(weddingId: string, invitation: InvitationRecord): Promise<InvitationRsvpView> {
    const [settings, responses] = await Promise.all([
      this.getSettings(weddingId),
      this.repository.findResponses(
        weddingId,
        invitation.guests.map((guest) => guest.id),
      ),
    ]);
    const byGuest = new Map(responses.map((response) => [response.guestId, response]));
    return {
      token: invitation.token,
      label: invitation.label,
      maxCompanions: invitation.maxCompanions,
      deadline: settings.deadline,
      guests: invitation.guests.map((guest) => {
        const response = byGuest.get(guest.id);
        return {
          id: guest.id,
          name: guest.name,
          isChild: guest.isChild,
          origin: guest.origin,
          status: response?.status ?? null,
          hasDietaryNotes: !!response?.dietaryNotes,
          message: response?.message ?? null,
        };
      }),
    };
  }
}
