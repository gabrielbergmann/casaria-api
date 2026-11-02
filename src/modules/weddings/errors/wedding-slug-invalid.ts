import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class WeddingSlugInvalid extends DomainError {
  readonly code = 'wedding.slug_invalid';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly title =
    'Use de 3 a 63 letras minúsculas, números ou hífens, sem hífen no começo, no fim ou repetido.';
}
