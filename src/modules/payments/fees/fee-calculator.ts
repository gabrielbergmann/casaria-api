import { PaymentInvalidFee } from '../errors/payment-errors';

export interface FeeConfig {
  /** Pontos-base: 499 = 4,99%. */
  percentBps: number;
  fixedCents: number;
}

export interface Charge {
  priceCents: number;
  feeCents: number;
  totalCents: number;
}

/** Sem taxa salva vale zero até o owner configurar (padrão do mantenedor enquanto a 001 não sai). */
export const DEFAULT_FEE: FeeConfig = { percentBps: 0, fixedCents: 0 };

export function assertValidFee(fee: FeeConfig): void {
  const valid =
    Number.isInteger(fee.percentBps) &&
    fee.percentBps >= 0 &&
    fee.percentBps <= 9_999 &&
    Number.isInteger(fee.fixedCents) &&
    fee.fixedCents >= 0;
  if (!valid) throw new PaymentInvalidFee();
}

/**
 * Taxa repassada ao convidado (PRD RF28): (preço + fixo) / (1 − percentual), arredondada para
 * cima, em inteiros (BigInt) para nunca passar por float.
 */
export function calculateCharge(priceCents: number, fee: FeeConfig): Charge {
  assertValidFee(fee);
  const numerator = BigInt(priceCents + fee.fixedCents) * 10_000n;
  const denominator = BigInt(10_000 - fee.percentBps);
  const totalCents = Number((numerator + denominator - 1n) / denominator);
  return { priceCents, feeCents: totalCents - priceCents, totalCents };
}
