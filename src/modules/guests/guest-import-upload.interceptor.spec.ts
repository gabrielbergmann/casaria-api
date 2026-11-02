import { Readable } from 'node:stream';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { GuestImportFileTooLarge } from './errors/guest-import-errors';
import { GuestImportUploadInterceptor, MAX_IMPORT_BYTES } from './guest-import-upload.interceptor';

const BOUNDARY = 'casaria-boundary';

/** Requisição multipart mínima que o multer consegue ler, sem servidor HTTP. */
function multipartRequest(content: Buffer) {
  const body = Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="lista.xlsx"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
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

describe('GuestImportUploadInterceptor', () => {
  const interceptor = new GuestImportUploadInterceptor();
  const next: CallHandler = { handle: () => of('handled') };

  it('accepts exactly 10 MB in memory', async () => {
    const req = multipartRequest(Buffer.alloc(MAX_IMPORT_BYTES));

    await interceptor.intercept(contextFor(req), next);

    expect(req.file.buffer.length).toBe(MAX_IMPORT_BYTES);
  });

  it('answers guest_import.file_too_large for an 11 MB file', async () => {
    const req = multipartRequest(Buffer.alloc(11 * 1024 * 1024));

    const error = await interceptor.intercept(contextFor(req), next).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GuestImportFileTooLarge);
    expect(error).toMatchObject({ status: 413, code: 'guest_import.file_too_large' });
  });
});
