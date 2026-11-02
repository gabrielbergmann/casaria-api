import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class GoogleFailed extends DomainError {
  readonly code = 'auth.google_failed';
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly title = 'Não foi possível entrar com o Google. Tente de novo.';
}
