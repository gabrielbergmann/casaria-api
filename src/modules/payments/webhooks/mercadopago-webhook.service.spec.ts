import { paymentsHarness, WEDDING_A, WEDDING_B } from '../../../common/testing/payments-harness';
import { PaymentInvalidSignature, PaymentOrderNotFound } from '../errors/payment-errors';
import { ProviderGrantRevoked, ProviderRequestFailed } from '../provider/payment-provider';

/** Pedido Pix pendente com 2 cotas reservadas, cobrado no "Mercado Pago" falso. */
async function pendingPixOrder() {
  const h = paymentsHarness();
  h.connect(WEDDING_A);
  h.connect(WEDDING_B);
  const gift = h.addGift();
  const created = await h.checkout.createOrder(WEDDING_A, h.orderInput(gift.id, { quantity: 2 }));
  const providerId = `ORD-${created.orderId}`;
  const notify = (requestId: string, overrides: Record<string, unknown> = {}) =>
    h.webhooks.handle({
      signature: 'ts=1,v1=assinado',
      requestId,
      dataId: providerId,
      type: 'order',
      action: 'order.updated',
      userId: undefined,
      ...overrides,
    });
  return { h, gift, orderId: created.orderId, providerId, notify };
}

describe('MercadoPagoWebhookService', () => {
  it('approves after consulting Mercado Pago, selling the quotas once even if the event repeats (RF11)', async () => {
    const { h, gift, providerId, notify } = await pendingPixOrder();
    h.provider.setRemoteStatus(providerId, 'APPROVED');

    await notify('req-1');
    await notify('req-1');
    await notify('req-2');

    expect(h.db.orders[0].status).toBe('APPROVED');
    expect(gift).toMatchObject({ quotasSold: 2, quotasReserved: 0 });
    expect(h.db.events.filter((event) => event.processedAt)).toHaveLength(2);
  });

  it('never trusts the body: without a change at Mercado Pago, nothing changes', async () => {
    const { h, gift, notify } = await pendingPixOrder();

    await notify('req-1', { action: 'order.processed' });

    expect(h.db.orders[0].status).toBe('PENDING');
    expect(gift.quotasReserved).toBe(2);
  });

  it('refuses an invalid, missing or late signature without changing state (RF12)', async () => {
    const { h, gift, providerId, notify } = await pendingPixOrder();
    h.provider.setRemoteStatus(providerId, 'APPROVED');
    h.provider.validSignature = false;

    await expect(notify('req-1')).rejects.toBeInstanceOf(PaymentInvalidSignature);
    await expect(notify('req-2', { signature: undefined })).rejects.toMatchObject({
      code: 'payment.invalid_signature',
    });
    expect(h.db.orders[0].status).toBe('PENDING');
    expect(gift.quotasSold).toBe(0);
    expect(h.db.events).toHaveLength(0);
  });

  it('does not change the order when the charge belongs to another account (RF11)', async () => {
    const { h, gift, providerId, notify } = await pendingPixOrder();
    // A mesma cobrança, agora "de outra conta": a consulta com o token do casal não a acha.
    h.provider.charges.get(providerId).providerUserId = 'mp-user-b';

    await notify('req-1');

    expect(h.db.orders[0].status).toBe('PENDING');
    expect(gift.quotasReserved).toBe(2);
  });

  it('does not change the order when the charge points to another order', async () => {
    const { h, providerId, notify } = await pendingPixOrder();
    h.provider.charges.get(providerId).externalReference = 'outro-pedido';
    h.provider.setRemoteStatus(providerId, 'APPROVED');

    await notify('req-1');

    expect(h.db.orders[0].status).toBe('PENDING');
  });

  it('frees the sold quotas on a refund and on a chargeback, keeping the order in Received (RF11)', async () => {
    const { h, gift, providerId, notify } = await pendingPixOrder();
    h.provider.setRemoteStatus(providerId, 'APPROVED');
    await notify('req-1');
    h.provider.setRemoteStatus(providerId, 'REFUNDED');

    await notify('req-2');

    expect(h.db.orders[0].status).toBe('REFUNDED');
    expect(gift).toMatchObject({ quotasSold: 0, quotasReserved: 0 });
    await expect(h.received.list(WEDDING_A)).resolves.toEqual([
      expect.objectContaining({ status: 'REFUNDED' }),
    ]);
  });

  it('answers with an error so Mercado Pago retries when it cannot consult the payment', async () => {
    const { h, providerId, notify } = await pendingPixOrder();
    h.provider.setRemoteStatus(providerId, 'APPROVED');
    h.provider.getPaymentError = new ProviderRequestFailed(503);

    await expect(notify('req-1')).rejects.toBeInstanceOf(ProviderRequestFailed);
    expect(h.db.events[0].processedAt).toBeNull();

    h.provider.getPaymentError = null;
    await notify('req-1');
    expect(h.db.orders[0].status).toBe('APPROVED');
  });

  it('asks for a retry while the charge id is not stored yet', async () => {
    const { notify } = await pendingPixOrder();

    await expect(notify('req-1', { dataId: 'ORD-desconhecida' })).rejects.toBeInstanceOf(
      PaymentOrderNotFound,
    );
  });

  it('disconnects on a deauthorization notice confirmed by Mercado Pago (RF03)', async () => {
    const { h, notify } = await pendingPixOrder();
    h.provider.refreshError = new ProviderGrantRevoked();

    await notify('req-1', {
      type: 'mp-connect',
      action: 'application.deauthorized',
      userId: 'mp-user-a',
      dataId: 'mp-user-a',
    });

    expect(h.db.accounts.find((a) => a.weddingId === WEDDING_A).status).toBe('DISCONNECTED');
    expect(h.db.accounts.find((a) => a.weddingId === WEDDING_B).status).toBe('CONNECTED');
  });

  it('ignores the authorization notice', async () => {
    const { h, notify } = await pendingPixOrder();
    h.provider.refreshError = new ProviderGrantRevoked();

    await notify('req-1', {
      type: 'mp-connect',
      action: 'application.authorized',
      userId: 'mp-user-a',
    });

    expect(h.db.accounts[0].status).toBe('CONNECTED');
  });
});
