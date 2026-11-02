import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaInvalidImage extends DomainError {
  readonly code = 'media.invalid_image';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Não foi possível ler a imagem.';
}
