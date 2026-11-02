import {
  paymentsHarness,
  WEDDING_A,
  type OrderRow,
} from '../../../common/testing/payments-harness';
import type { OrderStatus } from '../../../generated/prisma/enums';
import { canTransition } from './order-transitions';

const ALL: OrderStatus[] = [
  'PENDING',
  'IN_PROCESS',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'REFUNDED',
  'CHARGED_BACK',
];

const ALLOWED: [OrderStatus, OrderStatus][] = [
  ['PENDING', 'IN_PROCESS'],
  ['PENDING', 'APPROVED'],
  ['IN_PROCESS', 'APPROVED'],
  ['PENDING', 'REJECTED'],
  ['IN_PROCESS', 'REJECTED'],
  ['PENDING', 'EXPIRED'],
  ['APPROVED', 'REFUNDED'],
  ['APPROVED', 'CHARGED_BACK'],
];

/** Pedido de 2 cotas já no status `from`, com os contadores coerentes com ele. */
async function orderIn(from: OrderStatus) {
  const h = paymentsHarness();
  h.connect();
  const sold = ['APPROVED', 'REFUNDED', 'CHARGED_BACK'].includes(from) ? 2 : 0;
  const reserved = ['PENDING', 'IN_PROCESS'].includes(from) ? 2 : 0;
  const gift = h.addGift({ quotasSold: sold, quotasReserved: reserved });
  const order: OrderRow = {
    weddingId: WEDDING_A,
    id: '01890000-0000-7000-8000-0000000000d1',
    giftId: gift.id,
    quantity: 2,
    priceCents: 20_000,
    feeCents: 0,
    totalCents: 20_000,
    method: 'PIX',
    status: from,
    payerName: 'Carla',
    payerEmail: 'carla@example.com',
    payerCpfEnc: 'x',
    message: null,
    isAnonymous: false,
    reservationExpiresAt: h.now(),
    providerPaymentId: 'ORD-1',
    installments: null,
    approvedAt: sold ? h.now() : null,
    thankedAt: null,
    createdAt: h.now(),
  };
  h.db.orders.push(order);
  return { h, gift, order };
}

describe('order transitions (spec 012 table)', () => {
  it('allows exactly the transitions of the table', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = ALLOWED.some(([a, b]) => a === from && b === to);
        expect([from, to, canTransition(from, to)]).toEqual([from, to, expected]);
      }
    }
  });

  it.each([
    ['PENDING', 'APPROVED', { quotasSold: 2, quotasReserved: 0 }],
    ['IN_PROCESS', 'APPROVED', { quotasSold: 2, quotasReserved: 0 }],
    ['PENDING', 'IN_PROCESS', { quotasSold: 0, quotasReserved: 2 }],
    ['PENDING', 'REJECTED', { quotasSold: 0, quotasReserved: 0 }],
    ['IN_PROCESS', 'REJECTED', { quotasSold: 0, quotasReserved: 0 }],
    ['PENDING', 'EXPIRED', { quotasSold: 0, quotasReserved: 0 }],
    ['APPROVED', 'REFUNDED', { quotasSold: 0, quotasReserved: 0 }],
    ['APPROVED', 'CHARGED_BACK', { quotasSold: 0, quotasReserved: 0 }],
  ] as const)('%s → %s applies the quota effect', async (from, to, counters) => {
    const { h, gift, order } = await orderIn(from);

    await expect(h.transitions.apply(WEDDING_A, order.id, to)).resolves.toBe(to);

    expect(order.status).toBe(to);
    expect(gift).toMatchObject(counters);
  });

  it('records the approval time', async () => {
    const { h, order } = await orderIn('PENDING');

    await h.transitions.apply(WEDDING_A, order.id, 'APPROVED');

    expect(order.approvedAt).toEqual(h.now());
  });

  it('has no effect when the status repeats', async () => {
    const { h, gift, order } = await orderIn('APPROVED');

    await h.transitions.apply(WEDDING_A, order.id, 'APPROVED');

    expect(gift).toMatchObject({ quotasSold: 2, quotasReserved: 0 });
    expect(h.gifts.confirmQuotas).not.toHaveBeenCalled();
  });

  it.each([
    ['REJECTED', 'APPROVED'],
    ['EXPIRED', 'APPROVED'],
    ['APPROVED', 'PENDING'],
    ['REFUNDED', 'APPROVED'],
    ['IN_PROCESS', 'EXPIRED'],
  ] as const)('ignores and logs %s → %s', async (from, to) => {
    const { h, order } = await orderIn(from);

    await expect(h.transitions.apply(WEDDING_A, order.id, to)).resolves.toBe(from);

    expect(order.status).toBe(from);
    expect(h.logger.warn).toHaveBeenCalledWith(
      { orderId: order.id, from, to },
      'order_transition_ignored',
    );
  });

  it('ignores and logs a status outside the table', async () => {
    const { h, order } = await orderIn('PENDING');

    await h.transitions.apply(WEDDING_A, order.id, null);

    expect(order.status).toBe('PENDING');
    expect(h.logger.warn).toHaveBeenCalledWith(
      { orderId: order.id, from: 'PENDING' },
      'order_status_unknown',
    );
  });

  it('does not repeat the effect when another request applied the transition first', async () => {
    const { h, gift, order } = await orderIn('PENDING');
    h.ordersRepo.find.mockImplementationOnce(async () => {
      const snapshot = { ...order };
      order.status = 'APPROVED'; // outra requisição venceu a corrida
      return snapshot;
    });

    await h.transitions.apply(WEDDING_A, order.id, 'APPROVED');

    expect(h.gifts.confirmQuotas).not.toHaveBeenCalled();
    expect(gift.quotasSold).toBe(0);
  });
});
