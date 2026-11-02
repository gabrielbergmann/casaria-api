import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class TooManyLoginAttempts extends DomainError {
  readonly code = 'auth.too_many_attempts';
  readonly status = HttpStatus.TOO_MANY_REQUESTS;
  readonly title = 'Muitas tentativas de entrar. Aguarde alguns minutos.';
}
