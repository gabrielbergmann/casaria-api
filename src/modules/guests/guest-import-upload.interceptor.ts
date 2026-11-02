import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { GuestImportFileTooLarge } from './errors/guest-import-errors';

/** Limite do PRD ("Restrições"): planilha até 10 MB. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// Multipart em memória, um arquivo no campo file; passou do limite, o multer para de ler.
const MultipartFile = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

/** Importação da spec 009: o 413 genérico do multer vira guest_import.file_too_large. */
@Injectable()
export class GuestImportUploadInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartFile();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multipart.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new GuestImportFileTooLarge();
      throw error;
    }
  }
}
