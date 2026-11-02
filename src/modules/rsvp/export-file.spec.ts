import ExcelJS from 'exceljs';
import { escapeCell, EXPORT_COLUMNS, exportRows, toCsv, toXlsx } from './export-file';
import type { OpenResponseRecord } from './open-rsvp.repository';
import type { PersonRecord } from './rsvp.repository';

const person = (fields: Partial<PersonRecord>): PersonRecord => ({
  guestId: 'g',
  invitationLabel: 'Família Souza',
  name: 'Ana',
  isChild: false,
  origin: 'LIST',
  phone: null,
  email: null,
  status: 'PENDING',
  dietaryNotes: null,
  message: null,
  respondedAt: null,
  ...fields,
});

const people = [
  person({
    name: 'Ana Souza',
    phone: '+5511999990000',
    email: 'ana@example.com',
    status: 'CONFIRMED',
    dietaryNotes: 'Celíaca',
    message: 'Oba!',
  }),
  person({ name: 'Caio', isChild: true, status: 'PENDING' }),
  person({ name: '=HYPERLINK("https://evil.test","x")', origin: 'COMPANION', status: 'CONFIRMED' }),
];
const visitors: OpenResponseRecord[] = [
  {
    id: 'v',
    name: 'Davi',
    phone: null,
    email: 'davi@example.com',
    status: 'DECLINED',
    message: null,
    createdAt: new Date(),
  },
];

describe('RSVP export', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+5511999990000', "'+5511999990000"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTab', "'\tTab"],
    ['\rCR', "'\rCR"],
    ['Ana', 'Ana'],
    ['', ''],
  ])('escapes %p as %p', (value, expected) => {
    expect(escapeCell(value)).toBe(expected);
  });

  it('has one row per person and per visitor with the RF14 columns and no dietary notes', () => {
    const rows = exportRows(people, visitors);

    expect(rows).toEqual([
      [
        'Família Souza',
        'Ana Souza',
        'Lista',
        'Não',
        'Confirmado',
        "'+5511999990000",
        'ana@example.com',
      ],
      ['Família Souza', 'Caio', 'Lista', 'Sim', 'Pendente', '', ''],
      [
        'Família Souza',
        `'=HYPERLINK("https://evil.test","x")`,
        'Acompanhante',
        'Não',
        'Confirmado',
        '',
        '',
      ],
      ['', 'Davi', 'Visitante', '', 'Recusado', '', 'davi@example.com'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Celíaca');
    expect(JSON.stringify(rows)).not.toContain('Oba!');
  });

  it('writes the CSV with BOM, header and quoted cells', () => {
    const csv = toCsv(exportRows(people, visitors)).toString('utf8');
    const lines = csv.split('\r\n');

    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe(`﻿${EXPORT_COLUMNS.join(',')}`);
    expect(lines[3]).toBe(
      `Família Souza,"'=HYPERLINK(""https://evil.test"",""x"")",Acompanhante,Não,Confirmado,,`,
    );
    expect(lines).toHaveLength(6);
    expect(csv).not.toContain('Celíaca');
  });

  it('writes the XLSX with the same header and rows, formulas as text', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await toXlsx(exportRows(people, visitors))) as unknown as ExcelJS.Buffer,
    );
    const sheet = workbook.worksheets[0];

    expect(sheet.getRow(1).values).toEqual([undefined, ...EXPORT_COLUMNS]);
    expect(sheet.actualRowCount).toBe(5);
    expect(sheet.getCell('B4').value).toBe(`'=HYPERLINK("https://evil.test","x")`);
    expect(sheet.getCell('C5').value).toBe('Visitante');
  });
});
