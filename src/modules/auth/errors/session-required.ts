import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class SessionRequired extends DomainError {
  readonly code = 'auth.session_required';
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly title = 'Entre de novo para continuar.';
}
