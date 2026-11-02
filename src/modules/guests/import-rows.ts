import { z } from 'zod';
import { EmailField, NameField, PhoneField } from './guest-fields';
import type { TemplateRow } from './guest-template';

// Regras da importação pela planilha modelo (spec 009 RF07 a RF09, ADR-001 e ADR-002): o convite
// é a unidade, entra inteiro ou é recusado inteiro, e duplicado é o nome repetido no mesmo convite.

export interface ImportedGuest {
  name: string;
  isChild: boolean;
  phone: string | null;
  email: string | null;
}

export interface ImportedInvitation {
  label: string;
  maxCompanions: number;
  guests: ImportedGuest[];
}

export interface RejectedRow {
  row: number;
  name: string;
  reason: string;
}

export interface ImportPlan {
  invitations: ImportedInvitation[];
  rejected: RejectedRow[];
}

/** Pessoa já cadastrada, pelo nome do convite em que está. */
export interface ExistingPerson {
  invitationLabel: string;
  name: string;
}

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Convite: sem diferenciar maiúsculas e espaços extras (RF07). */
export const invitationKey = (label: string) => collapse(label).toLowerCase();

/** Pessoa: também sem acentos (RF08). */
export const personKey = (name: string) =>
  collapse(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const CHILD_VALUES: Record<string, boolean> = { '': false, sim: true, nao: false };

const RowSchema = z.object({
  invitation: z.string().max(120, { error: 'Use até 120 caracteres na coluna Convite.' }),
  name: NameField,
  child: z
    .string()
    .transform((value) => CHILD_VALUES[personKey(value)])
    .refine((value) => value !== undefined, {
      error: 'Use Sim, Não ou deixe vazio na coluna Criança.',
    }),
  phone: PhoneField,
  email: EmailField,
  companions: z
    .string()
    .regex(/^\d{0,3}$/, {
      error: 'Use na coluna Acompanhantes um número inteiro igual ou maior que 0, ou deixe vazio.',
    })
    .transform(Number),
});

type ParsedRow = { row: TemplateRow; label: string } & (
  { ok: true; guest: ImportedGuest; companions: number } | { ok: false; reason: string }
);

function parseRow(row: TemplateRow): ParsedRow {
  const label = collapse(row.invitation) || collapse(row.name);
  const result = RowSchema.safeParse(row);
  if (!result.success) {
    const reason = result.error.issues.map((issue) => issue.message).join(' ');
    return { row, label, ok: false, reason };
  }
  const { name, child, phone, email, companions } = result.data;
  return {
    row,
    label,
    ok: true,
    companions,
    guest: { name, isChild: child, phone: phone ?? null, email: email ?? null },
  };
}

/** Linhas de mesmo Convite juntas; Convite vazio é um convite só daquela pessoa (RF07). */
function groupRows(rows: TemplateRow[]): ParsedRow[][] {
  const groups = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const key = row.invitation.trim()
      ? `convite:${invitationKey(row.invitation)}`
      : `linha:${row.row}`;
    groups.set(key, [...(groups.get(key) ?? []), parseRow(row)]);
  }
  return [...groups.values()];
}

function existingByInvitation(existing: ExistingPerson[]): Map<string, Set<string>> {
  const byInvitation = new Map<string, Set<string>>();
  for (const person of existing) {
    const key = invitationKey(person.invitationLabel);
    byInvitation.set(key, (byInvitation.get(key) ?? new Set()).add(personKey(person.name)));
  }
  return byInvitation;
}

/**
 * Valida as linhas e separa os convites a gravar das linhas recusadas, cada uma com o motivo em
 * pt-BR. Convites existentes nunca são alterados: a mesma planilha reenviada volta duplicada.
 */
export function planImport(rows: TemplateRow[], existing: ExistingPerson[]): ImportPlan {
  const registered = existingByInvitation(existing);
  // Pessoas já vistas na planilha, por convite: nome normalizado → linha.
  const inSheet = new Map<string, Map<string, number>>();
  const invitations: ImportedInvitation[] = [];
  const rejected: RejectedRow[] = [];

  for (const group of groupRows(rows)) {
    const reasons = new Map<number, string>();
    for (const parsed of group) {
      const labelKey = invitationKey(parsed.label);
      const seen = inSheet.get(labelKey) ?? new Map<string, number>();
      inSheet.set(labelKey, seen);
      if (parsed.ok === false) {
        reasons.set(parsed.row.row, parsed.reason);
        continue;
      }
      const key = personKey(parsed.guest.name);
      if (registered.get(labelKey)?.has(key)) {
        reasons.set(parsed.row.row, `Duplicada: já está cadastrada no convite ${parsed.label}.`);
      } else if (seen.has(key)) {
        reasons.set(parsed.row.row, `Duplicada da linha ${seen.get(key)}.`);
      } else {
        seen.set(key, parsed.row.row);
      }
    }

    if (reasons.size > 0) {
      const cause = Math.min(...reasons.keys());
      for (const { row } of group) {
        rejected.push({
          row: row.row,
          name: row.name.trim(),
          reason:
            reasons.get(row.row) ??
            `Recusada junto com o convite: corrija a linha ${cause} e envie a planilha de novo.`,
        });
      }
      continue;
    }

    const accepted = group as Extract<ParsedRow, { ok: true }>[];
    invitations.push({
      label: accepted[0].label,
      maxCompanions: Math.max(...accepted.map((parsed) => parsed.companions)),
      guests: accepted.map((parsed) => parsed.guest),
    });
  }

  rejected.sort((a, b) => a.row - b.row);
  return { invitations, rejected };
}
