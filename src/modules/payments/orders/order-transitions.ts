import type { OrderStatus } from '../../../generated/prisma/enums';

/**
 * Tabela de transições da spec 012; status repetido não tem efeito, fora dela é ignorado.
 * AWAITING_CONFIRMATION é do Pix direto (spec 017): o convidado declara e o casal decide.
 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['IN_PROCESS', 'APPROVED', 'REJECTED', 'EXPIRED', 'AWAITING_CONFIRMATION'],
  IN_PROCESS: ['APPROVED', 'REJECTED'],
  AWAITING_CONFIRMATION: ['APPROVED', 'REJECTED'],
  APPROVED: ['REFUNDED', 'CHARGED_BACK'],
  REJECTED: [],
  EXPIRED: [],
  REFUNDED: [],
  CHARGED_BACK: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => ALLOWED[from].includes(to);

/** Efeito nas cotas de cada chegada (skill pagamentos §7). */
export function quotaEffect(
  to: OrderStatus,
): 'confirm' | 'release_reserved' | 'release_sold' | null {
  if (to === 'APPROVED') return 'confirm';
  if (to === 'REJECTED' || to === 'EXPIRED') return 'release_reserved';
  if (to === 'REFUNDED' || to === 'CHARGED_BACK') return 'release_sold';
  return null; // IN_PROCESS e AWAITING_CONFIRMATION mantêm a reserva até o status final
}
