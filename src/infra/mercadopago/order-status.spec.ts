import { centsToAmount, toProviderStatus } from './order-status';

describe('toProviderStatus', () => {
  it.each([
    ['action_required', 'waiting_transfer', 'PENDING'],
    ['created', 'created', 'PENDING'],
    ['processing', 'in_process', 'IN_PROCESS'],
    ['processed', 'accredited', 'APPROVED'],
    ['failed', 'failed', 'REJECTED'],
    ['failed', 'expired', 'EXPIRED'],
    ['canceled', 'expired', 'EXPIRED'],
    ['canceled', 'canceled', 'REJECTED'],
    ['refunded', 'refunded', 'REFUNDED'],
    ['charged_back', 'settled', 'CHARGED_BACK'],
  ])('maps %s/%s to %s', (status, detail, expected) => {
    expect(toProviderStatus(status, detail)).toBe(expected);
  });

  it('returns null for a status outside the table', () => {
    expect(toProviderStatus('in_mediation', 'x')).toBeNull();
  });
});

describe('centsToAmount', () => {
  it('writes reais with two decimals', () => {
    expect(centsToAmount(10_526)).toBe('105.26');
    expect(centsToAmount(5)).toBe('0.05');
    expect(centsToAmount(100_000_000)).toBe('1000000.00');
  });
});
