import type { PinoLogger } from 'nestjs-pino';
import { forEachWedding } from './for-each-wedding';

describe('forEachWedding', () => {
  const logger = {
    error: jest.fn(),
    runInContext: jest.fn(async (fn: () => Promise<void>) => fn()),
  };

  beforeEach(() => jest.clearAllMocks());

  it('calls the task once per wedding, each with its own weddingId', async () => {
    const task = jest.fn().mockResolvedValue(undefined);

    await forEachWedding(
      ['wedding-a', 'wedding-b', 'wedding-c'],
      task,
      logger as unknown as PinoLogger,
    );

    expect(task.mock.calls).toEqual([['wedding-a'], ['wedding-b'], ['wedding-c']]);
    expect(logger.runInContext).toHaveBeenCalledWith(expect.any(Function), {
      bindings: { weddingId: 'wedding-b' },
    });
  });

  it('keeps going when one wedding fails', async () => {
    const task = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined);

    await forEachWedding(['wedding-a', 'wedding-b'], task, logger as unknown as PinoLogger);

    expect(task).toHaveBeenCalledWith('wedding-b');
    expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'wedding_task_failed');
  });
});
