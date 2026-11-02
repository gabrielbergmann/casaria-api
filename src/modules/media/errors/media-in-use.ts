import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class MediaInUse extends DomainError {
  readonly code = 'media.in_use';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'A imagem está em uso e não pode ser excluída.';

  /** Lugares que usam a imagem, ex.: ["site"]. */
  constructor(readonly usedIn: string[]) {
    super();
  }

  override get extensions() {
    return { usedIn: this.usedIn };
  }
}
