import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class GuestNotFound extends DomainError {
  readonly code = 'guest.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Pessoa não encontrada.';
}
