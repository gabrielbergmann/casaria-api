import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberLastOwner extends DomainError {
  readonly code = 'member.last_owner';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'O casamento precisa de pelo menos um casal com acesso.';
}
