import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Mesmo 404 para casamento inexistente e para casamento alheio: não confirma que existe.
export class WeddingNotFound extends DomainError {
  readonly code = 'wedding.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Casamento não encontrado.';
}
