import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class ResetLinkInvalid extends DomainError {
  readonly code = 'auth.reset_link_invalid';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly title = 'Este link de redefinição é inválido ou expirou. Peça um novo.';
}
