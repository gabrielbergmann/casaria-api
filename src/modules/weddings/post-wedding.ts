/**
 * Pós-casamento (spec 014 RF01, ADR-001): a data passou quando o instante atual, em UTC, é
 * posterior à data e hora gravadas. Calculado a cada requisição, com o relógio injetável.
 */
export const isPostWedding = (weddingDate: Date, now: Date) =>
  now.getTime() > weddingDate.getTime();
