import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaNotFound extends DomainError {
  readonly code = 'media.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Imagem não encontrada.';
}
