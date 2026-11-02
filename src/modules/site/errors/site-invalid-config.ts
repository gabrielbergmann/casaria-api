import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export interface FieldError {
  path: string;
  message: string;
}

export class SiteInvalidConfig extends DomainError {
  readonly code = 'site.invalid_config';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'O documento do site tem campos inválidos.';

  constructor(readonly errors: FieldError[]) {
    super();
  }

  override get extensions() {
    return { errors: this.errors };
  }
}
