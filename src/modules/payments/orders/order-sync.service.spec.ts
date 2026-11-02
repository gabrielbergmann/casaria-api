import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';
import { ProviderRequestFailed } from '../provider/payment-provider';

const THIRTY_ONE_MINUTES = 31 * 60_000;
const DAY = 24 * 3600_000;

async function withOrder(method: 'PIX' | 'CARD') {
  const h = paymentsHarness();
  h.connect();
  const gift = h.addGift();
  const created = await h.checkout.createOrder(
    WEDDING_A,
    h.orderInput(gift.id, { method, quantity: 2 }),
  );
  return { h, gift, orderId: created.orderId, providerId: `ORD-${created.orderId}` };
}

describe('OrderSyncService', () => {
  describe('expireReservations (every 5 minutes)', () => {
    it('expires a card order whose card never came and frees the quotas', async () => {
      const { h, gift } = await withOrder('CARD');
      h.advance(THIRTY_ONE_MINUTES);

      await h.sync.expireReservations(WEDDING_A);

      expect(h.db.orders[0].status).toBe('EXPIRED');
      expect(gift.quotasReserved).toBe(0);
    });

    it('consults Mercado Pago first and approves a Pix paid at the last minute', async () => {
      const { h, gift, providerId } = await withOrder('PIX');
      h.provider.setRemoteStatus(providerId, 'APPROVED');
      h.advance(THIRTY_ONE_MINUTES);

      await h.sync.expireReservations(WEDDING_A);

      expect(h.db.orders[0].status).toBe('APPROVED');
      expect(gift).toMatchObject({ quotasSold: 2, quotasReserved: 0 });
    });

    it('expires a Pix still pending at Mercado Pago (RF13)', async () => {
      const { h, gift } = await withOrder('PIX');
      h.advance(THIRTY_ONE_MINUTES);

      await h.sync.expireReservations(WEDDING_A);

      expect(h.db.orders[0].status).toBe('EXPIRED');
      expect(gift.quotasReserved).toBe(0);
    });

    it('keeps the reservation while it is valid, and when Mercado Pago cannot be consulted', async () => {
      const { h } = await withOrder('PIX');
      await h.sync.expireReservations(WEDDING_A);
      expect(h.db.orders[0].status).toBe('PENDING');

      h.advance(THIRTY_ONE_MINUTES);
      h.provider.getPaymentError = new ProviderRequestFailed(503);
      await h.sync.expireReservations(WEDDING_A);
      expect(h.db.orders[0].status).toBe('PENDING');
    });

    it('only touches the orders of the wedding it runs for', async () => {
      const { h } = await withOrder('CARD');
      h.advance(THIRTY_ONE_MINUTES);

      await h.sync.expireReservations(WEDDING_B);

      expect(h.db.orders[0].status).toBe('PENDING');
    });
  });

  describe('reconcile (daily)', () => {
    it('approves an order approved at Mercado Pago (RF13)', async () => {
      const { h, gift, providerId } = await withOrder('PIX');
      h.provider.setRemoteStatus(providerId, 'APPROVED');

      await h.sync.reconcile(WEDDING_A);

      expect(h.db.orders[0].status).toBe('APPROVED');
      expect(gift.quotasSold).toBe(2);
    });

    it('syncs a chargeback of an approved order and ignores orders older than 180 days', async () => {
      const { h, gift, providerId } = await withOrder('PIX');
      h.db.accounts[0].expiresAt = new Date(h.now().getTime() + 400 * DAY); // conta renovada
      h.provider.setRemoteStatus(providerId, 'APPROVED');
      await h.sync.reconcile(WEDDING_A);
      h.provider.setRemoteStatus(providerId, 'CHARGED_BACK');
      h.advance(181 * DAY);

      await h.sync.reconcile(WEDDING_A);
      expect(h.db.orders[0].status).toBe('APPROVED');

      h.advance(-2 * DAY);
      await h.sync.reconcile(WEDDING_A);
      expect(h.db.orders[0].status).toBe('CHARGED_BACK');
      expect(gift.quotasSold).toBe(0);
    });
  });
});
