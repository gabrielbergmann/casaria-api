import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class InvitationRequiresGuest extends DomainError {
  readonly code = 'invitation.requires_guest';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'O convite precisa de pelo menos uma pessoa. Exclua o convite inteiro.';
}
