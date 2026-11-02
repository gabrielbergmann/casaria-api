import type { ProviderStatus } from '../../modules/payments/provider/payment-provider';

/**
 * Status da order da Orders API (documentação "Status da order") no status do pedido. Fora da
 * lista vira null: o pedido não muda e o evento fica no log.
 */
export function toProviderStatus(status: string, statusDetail: string): ProviderStatus | null {
  switch (status) {
    case 'created':
    case 'action_required': // Pix aguardando a transferência
      return 'PENDING';
    case 'processing': // cartão em análise
      return 'IN_PROCESS';
    case 'processed': // creditado (inclusive com reembolso parcial)
      return 'APPROVED';
    case 'refunded':
      return 'REFUNDED';
    case 'charged_back':
      return 'CHARGED_BACK';
    case 'expired':
      return 'EXPIRED';
    case 'canceled':
    case 'failed':
      return statusDetail === 'expired' ? 'EXPIRED' : 'REJECTED';
    default:
      return null;
  }
}

/** Centavos → "105.26", sem passar por float (skill pagamentos §4). */
export const centsToAmount = (cents: number) =>
  `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
