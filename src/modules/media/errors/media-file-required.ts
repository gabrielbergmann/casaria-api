import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaFileRequired extends DomainError {
  readonly code = 'media.file_required';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly title = 'Envie uma imagem no campo file.';
}
