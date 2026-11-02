import { Prisma } from '../../../generated/prisma/client';
import { expectWeddingScoped } from '../../../common/testing/wedding-scope';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { WebhookEventsRepository } from './webhook-events.repository';

describe('WebhookEventsRepository', () => {
  const webhookEvent = {
    create: jest.fn(),
    findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'e1', processedAt: new Date() }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = new WebhookEventsRepository({ webhookEvent } as unknown as PrismaService);
  const event = { requestId: 'req-1', topic: 'order', dataId: 'ORD1' };

  beforeEach(() => jest.clearAllMocks());

  it('records each x-request-id once and returns the existing event on a repeat (RF11)', async () => {
    webhookEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(repository.register('wedding-a', event)).resolves.toEqual({
      id: 'e1',
      processedAt: expect.any(Date),
    });
    expect(webhookEvent.findFirstOrThrow).toHaveBeenCalledWith({
      where: { weddingId: 'wedding-a', requestId: 'req-1' },
      select: { id: true, processedAt: true },
    });
  });

  it('scopes every write by weddingId and keeps no raw body', async () => {
    webhookEvent.create.mockResolvedValueOnce({ id: 'e1', processedAt: null });

    await repository.register('wedding-a', event);
    await repository.markProcessed('wedding-a', 'e1', new Date());

    expectWeddingScoped(webhookEvent.create, 'wedding-a');
    expectWeddingScoped(webhookEvent.updateMany, 'wedding-a');
    expect(Object.keys(webhookEvent.create.mock.calls[0][0].data).sort()).toEqual([
      'dataId',
      'requestId',
      'topic',
      'weddingId',
    ]);
  });
});
