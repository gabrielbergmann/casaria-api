import { Readable } from 'node:stream';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { MediaFileTooLarge } from './errors/media-file-too-large';
import { MAX_UPLOAD_BYTES, MediaUploadInterceptor } from './media-upload.interceptor';

const BOUNDARY = 'casaria-boundary';

/** Requisição multipart mínima que o multer consegue ler, sem servidor HTTP. */
function multipartRequest(field: string, fileName: string, content: Buffer) {
  const body = Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
    ),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
  return Object.assign(Readable.from([body]), {
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      'content-length': String(body.length),
    },
  }) as Readable & { headers: Record<string, string>; file?: { buffer: Buffer } };
}

const contextFor = (req: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  }) as ExecutionContext;

describe('MediaUploadInterceptor', () => {
  const interceptor = new MediaUploadInterceptor();
  const next: CallHandler = { handle: () => of('handled') };

  it('reads the file of the file field into memory', async () => {
    const req = multipartRequest('file', '../outro/x.jpg', Buffer.from('conteudo'));

    const result = await interceptor.intercept(contextFor(req), next);

    await expect(lastValueFrom(result)).resolves.toBe('handled');
    expect(req.file.buffer.toString()).toBe('conteudo');
  });

  it('accepts exactly 30 MB', async () => {
    const req = multipartRequest('file', 'x.jpg', Buffer.alloc(MAX_UPLOAD_BYTES));

    await interceptor.intercept(contextFor(req), next);

    expect(req.file.buffer.length).toBe(MAX_UPLOAD_BYTES);
  });

  it('answers media.file_too_large for 30 MB plus 1 byte', async () => {
    const req = multipartRequest('file', 'x.jpg', Buffer.alloc(MAX_UPLOAD_BYTES + 1));

    await expect(interceptor.intercept(contextFor(req), next)).rejects.toBeInstanceOf(
      MediaFileTooLarge,
    );
  });
});
