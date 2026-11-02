import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberNotFound extends DomainError {
  readonly code = 'member.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Membro não encontrado.';
}
