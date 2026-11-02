import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class SiteInvalidAlbumMedia extends DomainError {
  readonly code = 'site.invalid_album_media';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Uma foto do álbum não existe mais. Tire-a do álbum ou envie de novo.';
}
