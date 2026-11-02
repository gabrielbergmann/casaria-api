import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberInvitationAccountExists extends DomainError {
  readonly code = 'member_invitation.account_exists';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Já existe uma conta com este email. Entre para aceitar o convite.';
}
