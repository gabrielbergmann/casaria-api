import ExcelJS from 'exceljs';
import type { PinoLogger } from 'nestjs-pino';
import { GuestImportService } from './guest-import.service';
import { TEMPLATE_COLUMNS } from './guest-template';
import type { InvitationsRepository } from './invitations.repository';

async function sheetWith(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Convidados');
  [[...TEMPLATE_COLUMNS], ...rows].forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('GuestImportService', () => {
  const repository = {
    listPeople: jest.fn(),
    listCodes: jest.fn(),
    createFromImport: jest.fn(),
  };
  const logger = { info: jest.fn() };
  const service = new GuestImportService(
    repository as unknown as InvitationsRepository,
    logger as unknown as PinoLogger,
  );

  const threeValidAndOneInvalid = () =>
    sheetWith([
      ['Família A', 'Ana Alves', 'Não', '(11) 99999-0000', 'ana@example.com', ''],
      ['Família B', 'Bia Borges', '', '', '', 2],
      ['Família B', 'Beto Borges', 'Sim', '', '', ''],
      ['', 'Caio Costa', '', '', '', ''],
      ['Família D', 'Davi Dias', '', '', '', ''],
      ['Família D', 'Duda Dias', '', '1199', '', ''],
    ]);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.listPeople.mockResolvedValue([]);
    repository.listCodes.mockResolvedValue(new Set(['K7MQ2X']));
    repository.createFromImport.mockResolvedValue(undefined);
  });

  it('saves the 3 valid invitations and returns every row of the 4th', async () => {
    const result = await service.import('wedding-a', await threeValidAndOneInvalid());

    expect(result).toEqual({
      createdInvitations: 3,
      createdGuests: 4,
      rejected: [
        expect.objectContaining({ row: 6, name: 'Davi Dias' }),
        expect.objectContaining({
          row: 7,
          name: 'Duda Dias',
          reason: expect.stringContaining('Telefone'),
        }),
      ],
    });
    const [weddingId, invitations] = repository.createFromImport.mock.calls[0];
    expect(weddingId).toBe('wedding-a');
    expect(invitations.map((invitation: { label: string }) => invitation.label)).toEqual([
      'Família A',
      'Família B',
      'Caio Costa',
    ]);
    const codes = invitations.map((invitation: { code: string }) => invitation.code);
    expect(new Set([...codes, 'K7MQ2X']).size).toBe(4);
    expect(repository.listPeople).toHaveBeenCalledWith('wedding-a');
  });

  it('fails without saving anything when the transaction fails', async () => {
    repository.createFromImport.mockRejectedValue(new Error('connection lost'));

    await expect(service.import('wedding-a', await threeValidAndOneInvalid())).rejects.toThrow(
      'connection lost',
    );
    expect(repository.createFromImport).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('writes nothing when every row comes back', async () => {
    repository.listPeople.mockResolvedValue([
      { invitationLabel: 'Caio Costa', name: 'Caio Costa' },
    ]);

    const result = await service.import('wedding-a', await sheetWith([['', 'Caio Costa']]));

    expect(result.createdInvitations).toBe(0);
    expect(repository.createFromImport).not.toHaveBeenCalled();
  });

  it('logs only counts, never names, contacts, tokens or rows', async () => {
    await service.import('wedding-a', await threeValidAndOneInvalid());

    expect(logger.info).toHaveBeenCalledWith(
      { createdInvitations: 3, createdGuests: 4, rejectedRows: 2 },
      'guest_import_done',
    );
    const logged = JSON.stringify(logger.info.mock.calls);
    for (const personal of ['Ana', 'Davi', '99999', 'example.com', 'Família']) {
      expect(logged).not.toContain(personal);
    }
  });
});
