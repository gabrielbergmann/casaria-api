import { expectWeddingScoped } from '../../../common/testing/wedding-scope';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { PaymentAccountsRepository } from './payment-accounts.repository';

describe('PaymentAccountsRepository', () => {
  const paymentAccount = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const repository = new PaymentAccountsRepository({ paymentAccount } as unknown as PrismaService);
  const now = new Date('2027-01-10T12:00:00.000Z');
  const tokens = { accessTokenEnc: 'a', refreshTokenEnc: 'r', expiresAt: now };

  beforeEach(() => jest.clearAllMocks());

  it('scopes every read and write by weddingId (RNF01)', async () => {
    await repository.find('wedding-a');
    await repository.saveConnected('wedding-a', {
      ...tokens,
      providerUserId: 'mp',
      publicKey: 'pk',
      connectedAt: now,
    });
    await repository.saveRefreshed('wedding-a', 'r', tokens);
    await repository.disconnect('wedding-a', 'OWNER', now);

    expectWeddingScoped(paymentAccount.findUnique, 'wedding-a');
    expectWeddingScoped(paymentAccount.upsert, 'wedding-a');
    expectWeddingScoped(paymentAccount.updateMany, 'wedding-a');
  });

  it('erases the tokens on disconnection (RF03)', async () => {
    await repository.disconnect('wedding-a', 'DEAUTHORIZED', now, 'used-refresh');

    expect(paymentAccount.updateMany).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', status: 'CONNECTED', refreshTokenEnc: 'used-refresh' },
      data: {
        status: 'DISCONNECTED',
        disconnectReason: 'DEAUTHORIZED',
        disconnectedAt: now,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
      },
    });
  });

  it('finds weddings by the Mercado Pago user only among connected accounts (documented exception)', async () => {
    await repository.findConnectedWeddingIds('mp-user-a');

    expect(paymentAccount.findMany).toHaveBeenCalledWith({
      where: { providerUserId: 'mp-user-a', status: 'CONNECTED' },
      select: { weddingId: true },
    });
  });
});
