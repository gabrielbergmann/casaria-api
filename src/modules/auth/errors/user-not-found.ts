import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class UserNotFound extends DomainError {
  readonly code = 'auth.user_not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Nenhum usuário com este email.';
}
