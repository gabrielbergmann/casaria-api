import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';
import { GiftNotFound, GiftSoldOut } from '../../gifts/errors/gift-errors';
import {
  PaymentAccountDisconnected,
  PaymentChargeFailed,
  PaymentOrderNotPending,
} from '../errors/payment-errors';
import { ProviderRequestFailed } from '../provider/payment-provider';

const THIRTY_MINUTES = 30 * 60_000;

describe('CheckoutService', () => {
  describe('availability and quote', () => {
    it('is unavailable and refuses orders while the account is not connected (RF04)', async () => {
      const h = paymentsHarness();
      const gift = h.addGift();

      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({
        pix: false,
        card: false,
      });
      await expect(h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id))).rejects.toBeInstanceOf(
        PaymentAccountDisconnected,
      );
      expect(h.db.orders).toHaveLength(0);
      expect(gift.quotasReserved).toBe(0);
    });

    it('is unavailable with a disconnected or expired account', async () => {
      const h = paymentsHarness();
      h.connect(WEDDING_A, { expiresAt: new Date(h.now().getTime() - 1) });
      h.connect(WEDDING_B, { status: 'DISCONNECTED', accessTokenEnc: null, refreshTokenEnc: null });

      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({
        pix: false,
        card: false,
      });
      await expect(h.checkout.availability(WEDDING_B)).resolves.toEqual({
        pix: false,
        card: false,
      });
    });

    it('quotes 526 of fee and 10526 in total for 10000 with 499 bps (RF06)', async () => {
      const h = paymentsHarness();
      h.connect();
      await h.fees.save(
        WEDDING_A,
        { PIX: { percentBps: 0, fixedCents: 0 }, CARD: { percentBps: 499, fixedCents: 0 } },
        'owner',
      );
      const gift = h.addGift({
        type: 'VIRTUAL',
        priceCents: 10_000,
        quotaPriceCents: null,
        quotaTotal: null,
      });

      await expect(h.checkout.quote(WEDDING_A, gift.id, {})).resolves.toEqual({
        priceCents: 10_000,
        pix: { feeCents: 0, totalCents: 10_000 },
        card: { feeCents: 526, totalCents: 10_526 },
      });
    });

    it('uses the default fee (zero) when none was saved (RF05)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();

      const quote = await h.checkout.quote(WEDDING_A, gift.id, { quantity: 2 });

      expect(quote).toEqual({
        priceCents: 20_000,
        pix: { feeCents: 0, totalCents: 20_000 },
        card: { feeCents: 0, totalCents: 20_000 },
      });
    });
  });

  describe('createOrder', () => {
    it('creates a PENDING order with a 30-minute reservation and the CPF only encrypted (RF07)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();

      const created = await h.checkout.createOrder(
        WEDDING_A,
        h.orderInput(gift.id, { quantity: 3 }),
      );

      const [order] = h.db.orders;
      expect(order).toMatchObject({
        weddingId: WEDDING_A,
        status: 'PENDING',
        quantity: 3,
        priceCents: 30_000,
      });
      expect(order.reservationExpiresAt.getTime() - h.now().getTime()).toBe(THIRTY_MINUTES);
      expect(order.payerCpfEnc).not.toContain('52998224725');
      expect(h.crypto.decrypt(order.payerCpfEnc)).toBe('52998224725');
      expect(gift.quotasReserved).toBe(3);
      expect(created.payerCpfMasked).toBe('***.***.***-25');
    });

    it('charges Pix in the couple account with the order id as idempotency key and 30 minutes (RF09)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();

      const created = await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id));

      expect(h.provider.pixInputs).toEqual([
        {
          orderId: created.orderId,
          totalCents: 10_000,
          payer: { name: 'Carla Dias', email: 'carla@example.com', cpf: '52998224725' },
          expiresInMinutes: 30,
        },
      ]);
      expect(created.pix).toEqual({
        qrCode: `00020126-${created.orderId}`,
        qrCodeBase64: 'iVBORw0KGgo=',
        direct: false,
      });
      expect(created.status).toBe('PENDING');
      expect(h.db.orders[0].providerPaymentId).toBe(`ORD-${created.orderId}`);
    });

    it('returns the total and the public key of the couple for a card order, without charging', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();

      const created = await h.checkout.createOrder(
        WEDDING_A,
        h.orderInput(gift.id, { method: 'CARD' }),
      );

      expect(created).toMatchObject({
        totalCents: 10_000,
        card: { publicKey: 'APP_USR-public-a' },
      });
      expect(created.pix).toBeUndefined();
      expect(h.provider.cardInputs).toHaveLength(0);
    });

    it('creates exactly one order when two dispute the last quota (RF08)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift({ quotaTotal: 10, quotasSold: 9 });

      const results = await Promise.allSettled([
        h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id)),
        h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id)),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(GiftSoldOut);
      expect(h.db.orders).toHaveLength(1);
      expect(gift.quotasReserved).toBe(1);
    });

    it('refuses with gift.sold_out without order or reservation when quotas are missing (RF08)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift({ quotaTotal: 10, quotasSold: 8, quotasReserved: 1 });

      await expect(
        h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id, { quantity: 2 })),
      ).rejects.toBeInstanceOf(GiftSoldOut);
      expect(h.db.orders).toHaveLength(0);
      expect(gift.quotasReserved).toBe(1);
    });

    it('never takes a gift of another wedding (RNF01)', async () => {
      const h = paymentsHarness();
      h.connect();
      const giftOfB = h.addGift({ weddingId: WEDDING_B });

      await expect(
        h.checkout.createOrder(WEDDING_A, h.orderInput(giftOfB.id)),
      ).rejects.toBeInstanceOf(GiftNotFound);
      expect(giftOfB.quotasReserved).toBe(0);
    });

    it('closes the order as rejected and frees the quotas when the Pix charge fails (RF10)', async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();
      h.provider.chargeError = new ProviderRequestFailed(500);

      await expect(
        h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id, { quantity: 2 })),
      ).rejects.toBeInstanceOf(PaymentChargeFailed);
      expect(h.db.orders[0].status).toBe('REJECTED');
      expect(gift.quotasReserved).toBe(0);
    });
  });

  describe('payWithCard', () => {
    const cardOrder = async () => {
      const h = paymentsHarness();
      h.connect();
      const gift = h.addGift();
      const created = await h.checkout.createOrder(
        WEDDING_A,
        h.orderInput(gift.id, { method: 'CARD', quantity: 2 }),
      );
      const card = {
        cardToken: 'card-token',
        paymentMethodId: 'master',
        issuerId: '25',
        installments: 12,
      };
      return { h, gift, orderId: created.orderId, card };
    };

    it('charges the card once with the order id and turns reserved quotas into sold (RF09)', async () => {
      const { h, gift, orderId, card } = await cardOrder();

      const result = await h.checkout.payWithCard(WEDDING_A, orderId, card);

      expect(result).toEqual({ orderId, status: 'APPROVED' });
      expect(h.provider.cardInputs).toEqual([
        {
          orderId,
          totalCents: 20_000,
          payerEmail: 'carla@example.com',
          cardToken: 'card-token',
          paymentMethodId: 'master',
          issuerId: '25',
          installments: 12,
        },
      ]);
      expect(gift).toMatchObject({ quotasSold: 2, quotasReserved: 0 });
      expect(h.db.orders[0]).toMatchObject({ installments: 12, approvedAt: h.now() });
    });

    it('keeps the reservation while the card is in review', async () => {
      const { h, gift, orderId, card } = await cardOrder();
      h.provider.cardStatus = 'IN_PROCESS';

      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).resolves.toEqual({
        orderId,
        status: 'IN_PROCESS',
      });
      expect(gift.quotasReserved).toBe(2);
    });

    it('frees the quotas of a refused card and refuses a second card on the same order (RF10)', async () => {
      const { h, gift, orderId, card } = await cardOrder();
      h.provider.cardStatus = 'REJECTED';

      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).resolves.toEqual({
        orderId,
        status: 'REJECTED',
      });
      expect(gift.quotasReserved).toBe(0);
      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).rejects.toBeInstanceOf(
        PaymentOrderNotPending,
      );
    });

    it('logs the reason the gateway gave for a refused card', async () => {
      const { h, orderId, card } = await cardOrder();
      h.provider.cardStatus = 'REJECTED';
      h.provider.cardFailureReason = 'payment failed/cc_rejected_insufficient_amount';

      await h.checkout.payWithCard(WEDDING_A, orderId, card);

      expect(h.logger.warn).toHaveBeenCalledWith(
        { orderId, reason: 'payment failed/cc_rejected_insufficient_amount' },
        'payment_card_refused',
      );
    });

    it('frees the quotas when the card charge fails', async () => {
      const { h, gift, orderId, card } = await cardOrder();
      h.provider.chargeError = new ProviderRequestFailed(null);

      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).rejects.toBeInstanceOf(
        PaymentChargeFailed,
      );
      expect(h.db.orders[0].status).toBe('REJECTED');
      expect(gift.quotasReserved).toBe(0);
      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).rejects.toBeInstanceOf(
        PaymentOrderNotPending,
      );
    });

    it('refuses a card after the reservation expired', async () => {
      const { h, orderId, card } = await cardOrder();
      h.advance(THIRTY_MINUTES + 1);

      await expect(h.checkout.payWithCard(WEDDING_A, orderId, card)).rejects.toBeInstanceOf(
        PaymentOrderNotPending,
      );
      expect(h.provider.cardInputs).toHaveLength(0);
    });

    it('does not find an order of another wedding (RNF01)', async () => {
      const { h, orderId, card } = await cardOrder();

      await expect(h.checkout.payWithCard(WEDDING_B, orderId, card)).rejects.toMatchObject({
        code: 'payment.order_not_found',
      });
      await expect(h.checkout.getPublicOrder(WEDDING_B, orderId)).rejects.toMatchObject({
        code: 'payment.order_not_found',
      });
    });
  });

  it('shows only status and total of an order, without personal data', async () => {
    const h = paymentsHarness();
    h.connect();
    const gift = h.addGift();
    const created = await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id));

    await expect(h.checkout.getPublicOrder(WEDDING_A, created.orderId)).resolves.toEqual({
      orderId: created.orderId,
      method: 'PIX',
      status: 'PENDING',
      totalCents: 10_000,
    });
  });
});
