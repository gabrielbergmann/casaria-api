import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class TermsAcceptanceRequired extends DomainError {
  readonly code = 'terms.acceptance_required';
  readonly status = HttpStatus.FORBIDDEN;
  readonly title = 'Aceite os termos de uso e a política de privacidade para continuar.';
}
