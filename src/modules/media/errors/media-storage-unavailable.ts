import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaStorageUnavailable extends DomainError {
  readonly code = 'media.storage_unavailable';
  readonly status = HttpStatus.SERVICE_UNAVAILABLE;
  readonly title = 'Não foi possível guardar a imagem agora. Tente novamente.';
}
