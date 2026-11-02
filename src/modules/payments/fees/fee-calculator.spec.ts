import { PaymentInvalidFee } from '../errors/payment-errors';
import { calculateCharge } from './fee-calculator';

describe('calculateCharge (PRD RF28)', () => {
  it('charges 526 of fee on 10000 with 499 bps and no fixed part (spec 012 RF06)', () => {
    expect(calculateCharge(10_000, { percentBps: 499, fixedCents: 0 })).toEqual({
      priceCents: 10_000,
      feeCents: 526,
      totalCents: 10_526,
    });
  });

  it('charges nothing with a zero fee', () => {
    expect(calculateCharge(10_000, { percentBps: 0, fixedCents: 0 })).toEqual({
      priceCents: 10_000,
      feeCents: 0,
      totalCents: 10_000,
    });
  });

  it('adds only the fixed part', () => {
    expect(calculateCharge(10_000, { percentBps: 0, fixedCents: 99 }).totalCents).toBe(10_099);
  });

  it('rounds up so the couple never gets less than the price', () => {
    // (100 + 0) / (1 − 0,0199) = 102,0304... → 103
    expect(calculateCharge(100, { percentBps: 199, fixedCents: 0 }).totalCents).toBe(103);
    // 9501 × 10000 / 9501 = 10000 exato: sem arredondar a mais
    expect(calculateCharge(9_501, { percentBps: 499, fixedCents: 0 }).totalCents).toBe(10_000);
  });

  it.each([
    { percentBps: -1, fixedCents: 0 },
    { percentBps: 10_000, fixedCents: 0 },
    { percentBps: 4.5, fixedCents: 0 },
    { percentBps: 0, fixedCents: -1 },
  ])('refuses the configuration %p', (fee) => {
    expect(() => calculateCharge(10_000, fee)).toThrow(PaymentInvalidFee);
  });
});
