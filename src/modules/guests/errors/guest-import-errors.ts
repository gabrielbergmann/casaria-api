import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Recusas do arquivo inteiro (spec 009 RF10): nada é gravado.

export class GuestImportInvalidFile extends DomainError {
  readonly code = 'guest_import.invalid_file';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Envie a planilha modelo em XLSX, com pelo menos uma pessoa.';
}

export class GuestImportInvalidTemplate extends DomainError {
  readonly code = 'guest_import.invalid_template';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title =
    'A primeira linha precisa ser o cabeçalho do modelo: Convite, Nome, Criança, Telefone, Email e Acompanhantes.';
}

export class GuestImportFileTooLarge extends DomainError {
  readonly code = 'guest_import.file_too_large';
  readonly status = HttpStatus.PAYLOAD_TOO_LARGE;
  readonly title = 'A planilha passa de 10 MB.';
}

export class GuestImportTooManyRows extends DomainError {
  readonly code = 'guest_import.too_many_rows';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'A planilha passa de 20.000 linhas. Divida em arquivos menores.';
}
