// Prazo da anonimização (spec 015 RF01, RNF02): 6 meses de calendário depois da data do
// casamento, no calendário de São Paulo; dia inexistente vira o último dia do mês.

const MONTHS = 6;

const LOCAL_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "AAAA-MM-DD" do instante no calendário de São Paulo. */
export const saoPauloDate = (instant: Date) => LOCAL_DATE.format(instant);

const pad = (value: number) => String(value).padStart(2, '0');

/** 10/03/2027 → "2027-09-10"; 31/08/2027 → "2028-02-29". */
export function anonymizationDueDate(weddingDate: Date): string {
  const [year, month, day] = saoPauloDate(weddingDate).split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + MONTHS, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** O casamento entra na rotina a partir do dia do prazo, no calendário de São Paulo. */
export const isDueForAnonymization = (weddingDate: Date, now: Date) =>
  saoPauloDate(now) >= anonymizationDueDate(weddingDate);
