import type { RsvpStatus } from '../../generated/prisma/enums';
import type { InvitationRecord } from '../guests/invitations.repository';
import { RsvpCompanionsExceeded, RsvpInvalidAnswers } from './errors/rsvp-errors';

/**
 * Restrição alimentar só de escrita na rota pública (ADR-002): ausente mantém a gravada, null
 * apaga e texto substitui.
 */
export type DietaryNotesChange = string | null | undefined;

export interface GuestAnswer {
  guestId: string;
  status: RsvpStatus;
  dietaryNotes?: DietaryNotesChange;
  message: string | null;
}

export interface CompanionAnswer {
  /** Acompanhante já gravado deste convite; null cria um novo. */
  id: string | null;
  name: string;
  isChild: boolean;
  dietaryNotes?: DietaryNotesChange;
  message: string | null;
}

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

/**
 * A resposta é o estado completo do convite (ADR-001, RF07): uma presença por pessoa da lista,
 * sem repetir nem trazer pessoa de outro convite; acompanhantes só com id de acompanhante deste
 * convite e dentro do limite. Qualquer falha recusa tudo, antes de gravar.
 */
export function assertCompleteAnswer(
  invitation: InvitationRecord,
  answers: GuestAnswer[],
  companions: CompanionAnswer[],
): void {
  const listIds = new Set(
    invitation.guests.filter((guest) => guest.origin === 'LIST').map((guest) => guest.id),
  );
  const companionIds = new Set(
    invitation.guests.filter((guest) => guest.origin === 'COMPANION').map((guest) => guest.id),
  );
  const answered = answers.map((answer) => answer.guestId);
  const keptCompanions = companions.flatMap((companion) => (companion.id ? [companion.id] : []));

  if (
    answered.length !== listIds.size ||
    hasDuplicates(answered) ||
    !answered.every((id) => listIds.has(id)) ||
    hasDuplicates(keptCompanions) ||
    !keptCompanions.every((id) => companionIds.has(id))
  ) {
    throw new RsvpInvalidAnswers();
  }
  if (companions.length > invitation.maxCompanions) throw new RsvpCompanionsExceeded();
}
