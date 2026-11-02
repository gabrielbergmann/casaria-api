import ExcelJS from 'exceljs';
import {
  GuestImportInvalidFile,
  GuestImportInvalidTemplate,
  GuestImportTooManyRows,
} from './errors/guest-import-errors';
import { buildTemplate, readTemplate, TEMPLATE_COLUMNS } from './guest-template';

const HEADER = [...TEMPLATE_COLUMNS];

async function sheetWith(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Convidados');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('guest template', () => {
  it('offers the template with the fixed header and no data', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate()) as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.getRow(1).values).toEqual([undefined, ...HEADER]);
    expect(sheet.actualRowCount).toBe(1);
  });

  it('reads the rows of the template with the row number and the cell texts', async () => {
    const file = await sheetWith([
      HEADER,
      [
        'Família Lima',
        'Ana',
        'Não',
        11999990000,
        { text: 'ana@x.com', hyperlink: 'mailto:ana@x.com' },
        1,
      ],
      [],
      ['', 'Bia'],
    ]);

    await expect(readTemplate(file)).resolves.toEqual([
      {
        row: 2,
        invitation: 'Família Lima',
        name: 'Ana',
        child: 'Não',
        phone: '11999990000',
        email: 'ana@x.com',
        companions: '1',
      },
      { row: 4, invitation: '', name: 'Bia', child: '', phone: '', email: '', companions: '' },
    ]);
  });

  it('reads the template it offers once filled', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate()) as unknown as ExcelJS.Buffer);
    workbook.worksheets[0].addRow(['', 'Carlos']);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(readTemplate(file)).resolves.toMatchObject([{ row: 2, name: 'Carlos' }]);
  });

  it.each([
    ['a PDF renamed to .xlsx', async () => Buffer.from('%PDF-1.4 not a spreadsheet')],
    ['a truncated XLSX', async () => (await sheetWith([HEADER, ['', 'Ana']])).subarray(0, 300)],
    ['a template without data', () => sheetWith([HEADER])],
    ['an empty workbook', () => sheetWith([])],
  ])('rejects %s with guest_import.invalid_file', async (_case, file) => {
    await expect(readTemplate(await file())).rejects.toBeInstanceOf(GuestImportInvalidFile);
  });

  it('rejects a header out of order with guest_import.invalid_template', async () => {
    const file = await sheetWith([
      ['Nome', 'Convite', 'Criança', 'Telefone', 'Email', 'Acompanhantes'],
      ['Ana', ''],
    ]);

    await expect(readTemplate(file)).rejects.toBeInstanceOf(GuestImportInvalidTemplate);
  });

  it('accepts 20.000 data rows and rejects 20.001', async () => {
    const rows = (count: number) => [
      HEADER,
      ...Array.from({ length: count }, (_, i) => ['', `P${i}`]),
    ];

    await expect(readTemplate(await sheetWith(rows(20_000)))).resolves.toHaveLength(20_000);
    await expect(readTemplate(await sheetWith(rows(20_001)))).rejects.toBeInstanceOf(
      GuestImportTooManyRows,
    );
  });
});
