import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { MediaFileTooLarge } from './errors/media-file-too-large';

/** Limite do PRD ("Restrições"): 30 MB por imagem. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

// Multipart em memória, um arquivo no campo file; passou do limite, o multer para de ler.
const MultipartFile = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/** Upload da spec 006: o 413 genérico do multer vira media.file_too_large. */
@Injectable()
export class MediaUploadInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartFile();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multipart.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new MediaFileTooLarge();
      throw error;
    }
  }
}
