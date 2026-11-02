import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class TermsVersionOutdated extends DomainError {
  readonly code = 'terms.version_outdated';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Os termos mudaram. Recarregue a página e aceite a versão nova.';
}
