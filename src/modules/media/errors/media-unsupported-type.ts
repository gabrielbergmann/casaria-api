import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaUnsupportedType extends DomainError {
  readonly code = 'media.unsupported_type';
  readonly status = HttpStatus.UNSUPPORTED_MEDIA_TYPE;
  readonly title = 'Formato não aceito. Envie JPEG, PNG, WebP, HEIC ou AVIF.';
}
