import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberInvitationEmailMismatch extends DomainError {
  readonly code = 'member_invitation.email_mismatch';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'Este convite é para outro email. Entre com a conta do email convidado.';
}
