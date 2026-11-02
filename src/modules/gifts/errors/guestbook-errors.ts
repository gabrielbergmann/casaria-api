import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Erros do mural de recados (spec 013).

export class GuestbookDisabled extends DomainError {
  readonly code = 'guestbook.disabled';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'O mural de recados não está disponível.';
}

export class GuestbookMessageNotFound extends DomainError {
  readonly code = 'guestbook.message_not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Recado não encontrado.';
}
