import type { MercadoPagoWebhookService } from './webhooks/mercadopago-webhook.service';
import { WebhooksController } from './webhooks.controller';

describe('WebhooksController', () => {
  const webhooks = { handle: jest.fn() };
  const controller = new WebhooksController(webhooks as unknown as MercadoPagoWebhookService);

  beforeEach(() => jest.clearAllMocks());

  it('reads the signature headers, data.id and type from the query, and only type, action and user from the body', async () => {
    await controller.receive(
      'ts=1,v1=abc',
      'req-1',
      { 'data.id': 'ORD01', type: 'order' },
      { action: 'order.processed', user_id: 123, data: { id: 'OUTRO' }, status: 'approved' },
    );

    expect(webhooks.handle).toHaveBeenCalledWith({
      signature: 'ts=1,v1=abc',
      requestId: 'req-1',
      dataId: 'ORD01',
      type: 'order',
      action: 'order.processed',
      userId: '123',
    });
  });

  it('accepts data.id parsed as a nested object and the type from the body', async () => {
    await controller.receive('sig', 'req-2', { data: { id: '987' } }, { type: 'mp-connect' });

    expect(webhooks.handle).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: '987', type: 'mp-connect' }),
    );
  });
});
