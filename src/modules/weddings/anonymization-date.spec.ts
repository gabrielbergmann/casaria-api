import { anonymizationDueDate, isDueForAnonymization } from './anonymization-date';

// Rotina às 02:00 de Brasília (05:00 UTC).
const at2am = (day: string) => new Date(`${day}T05:00:00.000Z`);

describe('anonymization date (spec 015 RF01, RNF02)', () => {
  it('selects 10/03/2027 from 10/09/2027 on, not on 09/09/2027', () => {
    const wedding = new Date('2027-03-10T19:00:00.000Z');

    expect(anonymizationDueDate(wedding)).toBe('2027-09-10');
    expect(isDueForAnonymization(wedding, at2am('2027-09-09'))).toBe(false);
    expect(isDueForAnonymization(wedding, at2am('2027-09-10'))).toBe(true);
    expect(isDueForAnonymization(wedding, at2am('2027-12-01'))).toBe(true);
  });

  it('moves 31/08/2027 to the last day of February, 29/02/2028', () => {
    const wedding = new Date('2027-08-31T22:00:00.000Z');

    expect(anonymizationDueDate(wedding)).toBe('2028-02-29');
    expect(isDueForAnonymization(wedding, at2am('2028-02-28'))).toBe(false);
    expect(isDueForAnonymization(wedding, at2am('2028-02-29'))).toBe(true);
  });

  it('counts the date in the São Paulo calendar, not in UTC', () => {
    // 23h de 10/03 em Brasília já é 11/03 em UTC.
    expect(anonymizationDueDate(new Date('2027-03-11T02:00:00.000Z'))).toBe('2027-09-10');
  });
});
