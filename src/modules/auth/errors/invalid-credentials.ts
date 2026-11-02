import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class InvalidCredentials extends DomainError {
  readonly code = 'auth.invalid_credentials';
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly title = 'Email ou senha incorretos.';
}
