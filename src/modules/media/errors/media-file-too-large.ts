import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaFileTooLarge extends DomainError {
  readonly code = 'media.file_too_large';
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly title = 'A imagem passa de 30 MB.';
}
