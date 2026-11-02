import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Erros do RSVP (spec 010). invitation.not_found vem do módulo guests.

export class InvitationCodeBlocked extends DomainError {
  readonly code = 'invitation.code_blocked';
  readonly status = HttpStatus.TOO_MANY_REQUESTS;
  readonly title = 'Muitas tentativas de código. Tente de novo mais tarde.';

  constructor(readonly retryAfterSeconds: number) {
    super();
  }

  override get headers() {
    return { 'Retry-After': String(this.retryAfterSeconds) };
  }
}

export class RsvpInvalidAnswers extends DomainError {
  readonly code = 'rsvp.invalid_answers';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Responda uma vez por pessoa do convite.';
}

export class RsvpCompanionsExceeded extends DomainError {
  readonly code = 'rsvp.companions_exceeded';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'O convite não permite tantos acompanhantes.';
}

export class RsvpDeadlinePassed extends DomainError {
  readonly code = 'rsvp.deadline_passed';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'O prazo para confirmar presença terminou.';

  constructor(readonly deadline: Date) {
    super();
  }

  override get extensions() {
    return { deadline: this.deadline.toISOString() };
  }
}

export class RsvpOpenModeDisabled extends DomainError {
  readonly code = 'rsvp.open_mode_disabled';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'A confirmação sem convite não está aberta.';
}

export class OpenRsvpResponseNotFound extends DomainError {
  readonly code = 'open_rsvp_response.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Resposta não encontrada.';
}
