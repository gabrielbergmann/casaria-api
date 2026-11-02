import {
  OWNER,
  paymentsHarness,
  WEDDING_A,
  WEDDING_B,
} from '../../../common/testing/payments-harness';
import {
  PaymentInvalidPixKey,
  PaymentOrderNotAwaiting,
  PaymentOrderNotFound,
  PaymentOrderNotPending,
} from '../errors/payment-errors';
import { crc16 } from '../pix/br-code';

const THIRTY_MINUTES = 30 * 60_000;

// Pix direto na chave do casal (spec 017): sem Mercado Pago, sem taxa, com "Já fiz o Pix" e a
// conferência do owner.
describe('Pix direto (spec 017)', () => {
  const directOrder = async () => {
    const h = paymentsHarness();
    h.setPixKey();
    const gift = h.addGift();
    const created = await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id, { quantity: 2 }));
    return { h, gift, created };
  };

  describe('Pix key (RF01 a RF03)', () => {
    it('saves the normalized key and audits only its type', async () => {
      const h = paymentsHarness();

      await expect(
        h.pixKeys.save(WEDDING_A, 'PHONE', '(47) 99123-4567', OWNER.id),
      ).resolves.toEqual({ keyType: 'PHONE', key: '+5547991234567' });
      expect(h.audit.record).toHaveBeenCalledWith({
        action: 'payments.pix_key_changed',
        actorUserId: OWNER.id,
        weddingId: WEDDING_A,
        metadata: { keyType: 'PHONE' },
      });
      expect(JSON.stringify(h.audit.record.mock.calls)).not.toMatch(/99123/);
    });

    it('refuses an invalid key without saving it', async () => {
      const h = paymentsHarness();

      await expect(h.pixKeys.save(WEDDING_A, 'CPF', '123', OWNER.id)).rejects.toBeInstanceOf(
        PaymentInvalidPixKey,
      );
      await expect(h.pixKeys.get(WEDDING_A)).resolves.toBeNull();
    });

    it('removes the key with an audit, and does nothing when there is none', async () => {
      const h = paymentsHarness();
      h.setPixKey();

      await h.pixKeys.remove(WEDDING_A, OWNER.id);
      await h.pixKeys.remove(WEDDING_A, OWNER.id);

      await expect(h.pixKeys.get(WEDDING_A)).resolves.toBeNull();
      expect(h.audit.record).toHaveBeenCalledTimes(1);
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.pix_key_removed', metadata: {} }),
      );
    });
  });

  describe('checkout (RF04 a RF06, RF12)', () => {
    it('offers only Pix with a key and no Mercado Pago account, and nothing without both', async () => {
      const h = paymentsHarness();
      h.setPixKey();

      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({ pix: true, card: false });
      await expect(h.checkout.availability(WEDDING_B)).resolves.toEqual({
        pix: false,
        card: false,
      });
    });

    it('quotes the Pix without fee while the card keeps its fee', async () => {
      const h = paymentsHarness();
      h.setPixKey();
      h.connect();
      await h.fees.save(
        WEDDING_A,
        { PIX: { percentBps: 99, fixedCents: 0 }, CARD: { percentBps: 499, fixedCents: 0 } },
        OWNER.id,
      );
      const gift = h.addGift();

      const quote = await h.checkout.quote(WEDDING_A, gift.id, { quantity: 1 });

      expect(quote.pix).toEqual({ feeCents: 0, totalCents: 10_000 });
      expect(quote.card.feeCents).toBeGreaterThan(0);
    });

    it('creates a PIX_DIRECT order with the copy and paste of the key and never calls Mercado Pago', async () => {
      const { h, gift, created } = await directOrder();

      expect(created).toMatchObject({
        method: 'PIX_DIRECT',
        status: 'PENDING',
        priceCents: 20_000,
        feeCents: 0,
        totalCents: 20_000,
        reservationExpiresAt: new Date(h.now().getTime() + THIRTY_MINUTES),
      });
      expect(created.pix).toMatchObject({ qrCodeBase64: null, direct: true });
      expect(created.pix.qrCode).toContain('0117casal@example.com');
      expect(created.pix.qrCode).toContain('5406200.00');
      expect(created.pix.qrCode).toContain('5907Ana Bia6006BRASIL');
      expect(crc16(created.pix.qrCode.slice(0, -4))).toBe(created.pix.qrCode.slice(-4));
      expect(h.provider.pixInputs).toEqual([]);
      expect(gift.quotasReserved).toBe(2);
    });
  });

  describe('"Já fiz o Pix" (RF07, RF08)', () => {
    it('moves the order to awaiting confirmation and keeps the quotas reserved past 30 minutes', async () => {
      const { h, gift, created } = await directOrder();

      await expect(h.checkout.declarePixSent(WEDDING_A, created.orderId)).resolves.toEqual({
        orderId: created.orderId,
        method: 'PIX_DIRECT',
        status: 'AWAITING_CONFIRMATION',
        totalCents: 20_000,
      });
      h.advance(THIRTY_MINUTES + 60_000);
      await h.sync.expireReservations(WEDDING_A);

      expect(h.db.orders[0].status).toBe('AWAITING_CONFIRMATION');
      expect(gift.quotasReserved).toBe(2);
    });

    it('refuses a second declaration, an expired reservation and a Mercado Pago Pix', async () => {
      const { h, created } = await directOrder();
      await h.checkout.declarePixSent(WEDDING_A, created.orderId);
      await expect(h.checkout.declarePixSent(WEDDING_A, created.orderId)).rejects.toBeInstanceOf(
        PaymentOrderNotPending,
      );

      const late = await directOrder();
      late.h.advance(THIRTY_MINUTES + 1);
      await expect(
        late.h.checkout.declarePixSent(WEDDING_A, late.created.orderId),
      ).rejects.toBeInstanceOf(PaymentOrderNotPending);

      const viaGateway = paymentsHarness();
      viaGateway.connect();
      const gift = viaGateway.addGift();
      const order = await viaGateway.checkout.createOrder(
        WEDDING_A,
        viaGateway.orderInput(gift.id),
      );
      await expect(
        viaGateway.checkout.declarePixSent(WEDDING_A, order.orderId),
      ).rejects.toBeInstanceOf(PaymentOrderNotPending);
    });
  });

  describe('owner review (RF09 a RF11)', () => {
    const awaiting = async () => {
      const context = await directOrder();
      await context.h.checkout.declarePixSent(WEDDING_A, context.created.orderId);
      return context;
    };

    it('lists the awaiting order without CPF or email', async () => {
      const { h, created } = await awaiting();

      const items = await h.received.listAwaiting(WEDDING_A);

      expect(items).toEqual([
        {
          orderId: created.orderId,
          giftTitle: 'Lua de mel',
          quantity: 2,
          giver: 'Carla Dias',
          amountCents: 20_000,
          message: 'Felicidades!',
          createdAt: h.now(),
        },
      ]);
      expect(JSON.stringify(items)).not.toMatch(/carla@example|52998224725/);
      await expect(h.received.listAwaiting(WEDDING_B)).resolves.toEqual([]);
    });

    it('confirms: approves, sells the quotas, shows it in Recebidos and audits', async () => {
      const { h, gift, created } = await awaiting();

      await h.directPix.confirm(WEDDING_A, created.orderId, OWNER.id);

      expect(gift).toMatchObject({ quotasSold: 2, quotasReserved: 0 });
      await expect(h.received.list(WEDDING_A)).resolves.toEqual([
        expect.objectContaining({ orderId: created.orderId, method: 'PIX_DIRECT', feeCents: 0 }),
      ]);
      expect(h.audit.record).toHaveBeenCalledWith({
        action: 'payments.direct_pix_confirmed',
        actorUserId: OWNER.id,
        weddingId: WEDDING_A,
        metadata: { orderId: created.orderId },
      });
    });

    it('marks as not received: rejects and frees the quotas', async () => {
      const { h, gift, created } = await awaiting();

      await h.directPix.markNotReceived(WEDDING_A, created.orderId, OWNER.id);

      expect(h.db.orders[0].status).toBe('REJECTED');
      expect(gift).toMatchObject({ quotasSold: 0, quotasReserved: 0 });
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.direct_pix_not_received' }),
      );
    });

    it('refuses an order that is not awaiting, and the order of another wedding', async () => {
      const { h, created } = await directOrder();

      await expect(
        h.directPix.confirm(WEDDING_A, created.orderId, OWNER.id),
      ).rejects.toBeInstanceOf(PaymentOrderNotAwaiting);
      await h.checkout.declarePixSent(WEDDING_A, created.orderId);
      await expect(
        h.directPix.markNotReceived(WEDDING_B, created.orderId, OWNER.id),
      ).rejects.toBeInstanceOf(PaymentOrderNotFound);
      expect(h.db.orders[0].status).toBe('AWAITING_CONFIRMATION');
    });
  });
});
