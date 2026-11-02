import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberAlreadyExists extends DomainError {
  readonly code = 'member.already_exists';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Esta pessoa já tem acesso ao painel deste casamento.';
}
