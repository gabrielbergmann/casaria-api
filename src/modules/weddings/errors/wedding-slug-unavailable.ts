import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class WeddingSlugUnavailable extends DomainError {
  readonly code = 'wedding.slug_unavailable';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Este endereço já está em uso. Escolha outro.';
}
