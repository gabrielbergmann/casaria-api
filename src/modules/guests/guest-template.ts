import ExcelJS from 'exceljs';
import {
  GuestImportInvalidFile,
  GuestImportInvalidTemplate,
  GuestImportTooManyRows,
} from './errors/guest-import-errors';

// Planilha modelo (spec 009 RF05, RF10, ADR-001): o mesmo cabeçalho no modelo e na leitura.
export const TEMPLATE_COLUMNS = [
  'Convite',
  'Nome',
  'Criança',
  'Telefone',
  'Email',
  'Acompanhantes',
] as const;

export const TEMPLATE_FILENAME = 'modelo-convidados.xlsx';
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_IMPORT_ROWS = 20_000;

/** Uma linha de dados, com os textos das seis colunas e o número da linha na planilha. */
export interface TemplateRow {
  row: number;
  invitation: string;
  name: string;
  child: string;
  phone: string;
  email: string;
  companions: string;
}

const COLUMN_WIDTHS = [24, 32, 10, 20, 32, 16];
const PHONE_COLUMN = 4;

export async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Convidados');
  sheet.addRow([...TEMPLATE_COLUMNS]).font = { bold: true };
  COLUMN_WIDTHS.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  // Telefone como texto: o Excel não tira o zero nem converte em número.
  sheet.getColumn(PHONE_COLUMN).numFmt = '@';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const cellTexts = (row: ExcelJS.Row) =>
  TEMPLATE_COLUMNS.map((_column, index) => row.getCell(index + 1).text.trim());

const sameHeader = (texts: string[]) =>
  TEMPLATE_COLUMNS.every((column, index) => texts[index]?.toLowerCase() === column.toLowerCase());

/**
 * Lê a primeira aba (RF10). A primeira linha preenchida é o cabeçalho; linhas vazias são
 * ignoradas; passou de 20.000 linhas de dados, recusa. O leitor em streaming do exceljs 4.4.0
 * perde entradas do zip no Node 26, por isso o arquivo (até 10 MB) é lido inteiro em memória.
 */
export async function readTemplate(file: Buffer): Promise<TemplateRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  } catch {
    throw new GuestImportInvalidFile();
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new GuestImportInvalidFile();

  const rows: TemplateRow[] = [];
  let header: string[] | null = null;
  for (let number = 1; number <= sheet.rowCount; number++) {
    const row = sheet.findRow(number);
    const texts = row ? cellTexts(row) : [];
    if (texts.every((text) => text === '')) continue;
    if (!header) {
      header = texts;
      if (!sameHeader(header)) throw new GuestImportInvalidTemplate();
      continue;
    }
    if (rows.length === MAX_IMPORT_ROWS) throw new GuestImportTooManyRows();
    const [invitation, name, child, phone, email, companions] = texts;
    rows.push({ row: number, invitation, name, child, phone, email, companions });
  }
  if (rows.length === 0) throw new GuestImportInvalidFile();
  return rows;
}
