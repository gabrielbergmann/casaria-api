import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';
import { PaymentInvalidFee } from '../errors/payment-errors';

describe('PaymentFeesService (RF05)', () => {
  const fees = (pix: number, card: number) => ({
    PIX: { percentBps: pix, fixedCents: 0 },
    CARD: { percentBps: card, fixedCents: 0 },
  });

  it('uses zero for both methods until the owner configures', async () => {
    const h = paymentsHarness();

    await expect(h.fees.get(WEDDING_A)).resolves.toEqual(fees(0, 0));
  });

  it('saves per wedding and audits the previous and the new values', async () => {
    const h = paymentsHarness();

    await h.fees.save(WEDDING_A, fees(99, 499), 'owner-1');

    await expect(h.fees.get(WEDDING_A)).resolves.toEqual(fees(99, 499));
    await expect(h.fees.get(WEDDING_B)).resolves.toEqual(fees(0, 0));
    expect(h.audit.record).toHaveBeenCalledWith({
      action: 'payments.fees_changed',
      actorUserId: 'owner-1',
      weddingId: WEDDING_A,
      metadata: {
        pixPercentBpsBefore: 0,
        pixFixedCentsBefore: 0,
        cardPercentBpsBefore: 0,
        cardFixedCentsBefore: 0,
        pixPercentBps: 99,
        pixFixedCents: 0,
        cardPercentBps: 499,
        cardFixedCents: 0,
      },
    });
  });

  it('does not audit a save without change', async () => {
    const h = paymentsHarness();

    await h.fees.save(WEDDING_A, fees(0, 0), 'owner-1');

    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it.each([
    { PIX: { percentBps: 10_000, fixedCents: 0 }, CARD: { percentBps: 0, fixedCents: 0 } },
    { PIX: { percentBps: -1, fixedCents: 0 }, CARD: { percentBps: 0, fixedCents: 0 } },
    { PIX: { percentBps: 0, fixedCents: 0 }, CARD: { percentBps: 0, fixedCents: -1 } },
  ])('refuses %p with payment.invalid_fee and saves nothing', async (invalid) => {
    const h = paymentsHarness();

    await expect(h.fees.save(WEDDING_A, invalid, 'owner-1')).rejects.toBeInstanceOf(
      PaymentInvalidFee,
    );
    expect(h.db.fees).toHaveLength(0);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});
