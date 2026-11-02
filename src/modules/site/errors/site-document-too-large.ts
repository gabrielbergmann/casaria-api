import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

export class SiteDocumentTooLarge extends DomainError {
  readonly code = 'site.document_too_large';
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly title = 'O documento do site passa de 100 KB.';
}
