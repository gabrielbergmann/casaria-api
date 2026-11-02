import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class ForbiddenOrigin extends DomainError {
  readonly code = 'auth.forbidden_origin';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'Origem da requisição não permitida.';
}
