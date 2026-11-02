import ExcelJS from 'exceljs';
import type { OpenResponseRecord } from './open-rsvp.repository';
import type { PersonRecord, PersonStatus } from './rsvp.repository';

// Exportação da lista (spec 010 RF14, RNF04): uma linha por pessoa e por visitante, nunca a
// restrição alimentar (RF13).
export const EXPORT_COLUMNS = [
  'Convite',
  'Nome',
  'Origem',
  'Criança',
  'Presença',
  'Telefone',
  'Email',
] as const;

export type ExportFormat = 'csv' | 'xlsx';

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ORIGIN_LABELS = { LIST: 'Lista', COMPANION: 'Acompanhante' } as const;
const PRESENCE_LABELS: Record<PersonStatus, string> = {
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusado',
  PENDING: 'Pendente',
};

/** Célula que a planilha leria como fórmula ganha apóstrofo na frente (RNF04). */
export const escapeCell = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export function exportRows(people: PersonRecord[], visitors: OpenResponseRecord[]): string[][] {
  const rows = [
    ...people.map((person) => [
      person.invitationLabel,
      person.name,
      ORIGIN_LABELS[person.origin],
      person.isChild ? 'Sim' : 'Não',
      PRESENCE_LABELS[person.status],
      person.phone ?? '',
      person.email ?? '',
    ]),
    ...visitors.map((visitor) => [
      '',
      visitor.name,
      'Visitante',
      '',
      PRESENCE_LABELS[visitor.status],
      visitor.phone ?? '',
      visitor.email ?? '',
    ]),
  ];
  return rows.map((row) => row.map(escapeCell));
}

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** CSV com vírgula e BOM, para o Excel abrir os acentos em UTF-8. */
export function toCsv(rows: string[][]): Buffer {
  const lines = [[...EXPORT_COLUMNS], ...rows].map((row) => row.map(csvCell).join(','));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Confirmações');
  sheet.addRow([...EXPORT_COLUMNS]).font = { bold: true };
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
