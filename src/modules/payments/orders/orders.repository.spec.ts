import { expectWeddingScoped } from '../../../common/testing/wedding-scope';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { Tx } from '../../../infra/prisma/transaction-runner';
import { OrdersRepository } from './orders.repository';

describe('OrdersRepository', () => {
  const order = {
    create: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = { order };
  const repository = new OrdersRepository(prisma as unknown as PrismaService);
  const tx = prisma as unknown as Tx;
  const now = new Date('2027-01-10T12:00:00.000Z');

  beforeEach(() => jest.clearAllMocks());

  it('scopes every read and write by weddingId (RNF01)', async () => {
    await repository.createPending(
      'wedding-a',
      {
        giftId: 'g',
        quantity: 1,
        priceCents: 1,
        feeCents: 0,
        totalCents: 1,
        method: 'PIX',
        payerName: 'Ana',
        payerEmail: 'ana@example.com',
        payerCpfEnc: 'enc',
        message: null,
        isAnonymous: false,
        reservationExpiresAt: now,
      },
      tx,
    );
    await repository.find('wedding-a', 'order-of-b');
    await repository.setProviderPayment('wedding-a', 'order-of-b', 'ORD-1', null);
    await repository.transition('wedding-a', 'order-of-b', 'PENDING', 'APPROVED', now, tx);
    await repository.listExpiredPending('wedding-a', now);
    await repository.listToReconcile('wedding-a', now);
    await repository.listReceived('wedding-a');
    await repository.setThanked('wedding-a', 'order-of-b', now);

    expectWeddingScoped(order.create, 'wedding-a');
    expectWeddingScoped(order.findFirst, 'wedding-a');
    expectWeddingScoped(order.findMany, 'wedding-a');
    expectWeddingScoped(order.updateMany, 'wedding-a');
  });

  it('marks thanked only once, on a received order of the wedding (spec 014 RF07)', async () => {
    order.updateMany.mockResolvedValueOnce({ count: 0 });
    order.findFirst.mockResolvedValueOnce({ id: 'order-1' });

    await expect(repository.setThanked('wedding-a', 'order-1', now)).resolves.toBe(true);

    const received = { id: 'order-1', weddingId: 'wedding-a', approvedAt: { not: null } };
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { ...received, thankedAt: null },
      data: { thankedAt: now },
    });
    expect(order.findFirst).toHaveBeenCalledWith({ where: received, select: { id: true } });
  });

  it('unmarks thanked on a received order and says no for an unknown one', async () => {
    order.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(repository.setThanked('wedding-a', 'order-x', null)).resolves.toBe(false);

    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-x', weddingId: 'wedding-a', approvedAt: { not: null } },
      data: { thankedAt: null },
    });
    expect(order.findFirst).not.toHaveBeenCalled();
  });

  it('changes the status only from the expected one (conditional update)', async () => {
    await repository.transition('wedding-a', 'order-1', 'PENDING', 'APPROVED', now, tx);

    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', weddingId: 'wedding-a', status: 'PENDING' },
      data: { status: 'APPROVED', approvedAt: now },
    });
  });

  it('stores at most one charge per order', async () => {
    await repository.setProviderPayment('wedding-a', 'order-1', 'ORD-1', 3);

    expect(order.updateMany.mock.calls[0][0].where).toEqual({
      id: 'order-1',
      weddingId: 'wedding-a',
      providerPaymentId: null,
    });
  });

  it('lists in Received only orders that reached approved, newest first, without CPF or email', async () => {
    await repository.listReceived('wedding-a');

    const args = order.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ weddingId: 'wedding-a', approvedAt: { not: null } });
    expect(args.orderBy).toEqual([{ approvedAt: 'desc' }, { id: 'desc' }]);
    expect(args.select.payerCpfEnc).toBeUndefined();
    expect(args.select.payerEmail).toBeUndefined();
  });

  it('finds the order of a notification only by the charge id (documented exception)', async () => {
    await repository.findByProviderPaymentId('ORD01ABC');

    expect(order.findFirst).toHaveBeenCalledWith({
      where: { providerPaymentId: { equals: 'ORD01ABC', mode: 'insensitive' } },
      select: { id: true, weddingId: true },
    });
  });
});
