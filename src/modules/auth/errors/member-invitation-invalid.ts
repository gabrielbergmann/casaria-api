import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MemberInvitationInvalid extends DomainError {
  readonly code = 'member_invitation.invalid';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Este convite é inválido, venceu ou já foi usado. Peça um novo link.';
}
