import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class GoogleAccountNotRegistered extends DomainError {
  readonly code = 'auth.google_account_not_registered';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'Esta conta Google não tem acesso ao painel.';
}
