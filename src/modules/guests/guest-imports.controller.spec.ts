import { StreamableFile } from '@nestjs/common';
import { GuestImportInvalidFile } from './errors/guest-import-errors';
import { GuestImportsController } from './guest-imports.controller';
import type { GuestImportService } from './guest-import.service';

describe('GuestImportsController', () => {
  const imports = { import: jest.fn() };
  const controller = new GuestImportsController(imports as unknown as GuestImportService);
  const tenant = { weddingId: 'wedding-a', role: 'editor' as const };

  beforeEach(() => jest.resetAllMocks());

  it('answers guest_import.invalid_file without a file', async () => {
    await expect(controller.import(tenant, undefined)).rejects.toBeInstanceOf(
      GuestImportInvalidFile,
    );
    await expect(controller.import(tenant, { buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(
      GuestImportInvalidFile,
    );
    expect(imports.import).not.toHaveBeenCalled();
  });

  it('passes only the content and the weddingId of the guard to the service', async () => {
    const file = { buffer: Buffer.from('xlsx'), originalname: '../outro.xlsx' };

    await controller.import(tenant, file);

    expect(imports.import).toHaveBeenCalledWith('wedding-a', file.buffer);
  });

  it('offers the template as modelo-convidados.xlsx', async () => {
    const file = await controller.template();

    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="modelo-convidados.xlsx"',
    });
  });
});
