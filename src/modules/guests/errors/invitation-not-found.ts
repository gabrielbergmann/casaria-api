import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

/** Mesmo corpo para id, token ou código inexistente, de outro casamento ou regenerado. */
export class InvitationNotFound extends DomainError {
  readonly code = 'invitation.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Convite não encontrado.';
}
