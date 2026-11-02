import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class ForbiddenRole extends DomainError {
  readonly code = 'auth.forbidden_role';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'Você não tem permissão para esta ação.';
}
