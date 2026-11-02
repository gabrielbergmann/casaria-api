import { expectWeddingScoped } from '../../../common/testing/wedding-scope';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { PaymentFeesRepository } from './payment-fees.repository';

describe('PaymentFeesRepository', () => {
  const paymentFee = {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    paymentFee,
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const repository = new PaymentFeesRepository(prisma as unknown as PrismaService);

  it('scopes reads and writes by weddingId and writes both methods in one transaction', async () => {
    await repository.list('wedding-a');
    await repository.saveAll('wedding-a', {
      PIX: { percentBps: 99, fixedCents: 0 },
      CARD: { percentBps: 499, fixedCents: 0 },
    });

    expectWeddingScoped(paymentFee.findMany, 'wedding-a');
    expectWeddingScoped(paymentFee.upsert, 'wedding-a');
    expect(paymentFee.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
