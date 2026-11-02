import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class CurrentPasswordInvalid extends DomainError {
  readonly code = 'auth.current_password_invalid';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly title = 'A senha atual não confere.';
}
