import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';

describe('ReceivedGiftsService (RF14)', () => {
  async function approved(isAnonymous: boolean, weddingId = WEDDING_A) {
    const h = paymentsHarness();
    h.connect(weddingId);
    const gift = h.addGift({ weddingId, title: 'Jantar' });
    const created = await h.checkout.createOrder(
      weddingId,
      h.orderInput(gift.id, { method: 'CARD', isAnonymous }),
    );
    await h.checkout.payWithCard(weddingId, created.orderId, {
      cardToken: 't',
      paymentMethodId: 'visa',
      issuerId: null,
      installments: 1,
    });
    return { h, gift, orderId: created.orderId };
  }

  it('lists the approved order with gift, giver, value, fee, message, status and date, without CPF or email', async () => {
    const { h, orderId } = await approved(false);

    const [item] = await h.received.list(WEDDING_A);

    expect(item).toEqual({
      orderId,
      giftTitle: 'Jantar',
      quantity: 1,
      giver: 'Carla Dias',
      amountCents: 10_000,
      feeCents: 0,
      method: 'CARD',
      message: 'Felicidades!',
      status: 'APPROVED',
      approvedAt: h.now(),
      thankedAt: null,
    });
    expect(JSON.stringify(item)).not.toMatch(/carla@example|52998224725/);
  });

  it('shows "Anônimo" when the guest asked not to show the name', async () => {
    const { h } = await approved(true);

    await expect(h.received.list(WEDDING_A)).resolves.toEqual([
      expect.objectContaining({ giver: 'Anônimo' }),
    ]);
  });

  it('keeps out orders that never reached approved and orders of another wedding', async () => {
    const { h } = await approved(false, WEDDING_B);
    const gift = h.addGift();
    h.connect(WEDDING_A);
    await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id));

    await expect(h.received.list(WEDDING_A)).resolves.toEqual([]);
  });

  it('marks and unmarks thanked only on an order that reached approved (for spec 014)', async () => {
    const { h, orderId } = await approved(false);

    await expect(h.received.setThanked(WEDDING_A, orderId, h.now())).resolves.toBe(true);
    expect(h.db.orders[0].thankedAt).toEqual(h.now());
    await expect(h.received.setThanked(WEDDING_A, orderId, null)).resolves.toBe(true);
    await expect(h.received.setThanked(WEDDING_B, orderId, h.now())).resolves.toBe(false);
  });
});
