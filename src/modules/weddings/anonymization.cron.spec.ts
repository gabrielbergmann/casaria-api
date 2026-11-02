import type { PinoLogger } from 'nestjs-pino';
import type { Clock } from '../../common/time/clock';
import { AnonymizationCron } from './anonymization.cron';
import { type PersonalDataAnonymizer, PersonalDataAnonymizers } from './personal-data-anonymizers';
import type { WeddingsService } from './weddings.service';

const NOW = new Date('2027-09-10T05:00:00.000Z');

describe('AnonymizationCron (spec 015)', () => {
  /** Banco falso: casamentos devidos e marcas gravadas. */
  function setup(dueIds: string[], failing: Set<string> = new Set()) {
    const marked = new Map<string, Date>();
    const calls: string[] = [];
    const weddings = {
      listIdsDueForAnonymization: jest.fn(async () => dueIds.filter((id) => !marked.has(id))),
      markAnonymized: jest.fn(async (weddingId: string, now: Date) => {
        calls.push(`mark:${weddingId}`);
        if (!marked.has(weddingId)) marked.set(weddingId, now);
      }),
    };
    const registry = new PersonalDataAnonymizers();
    const anonymizer = (name: string): PersonalDataAnonymizer => ({
      name,
      anonymize: jest.fn(async (weddingId: string) => {
        calls.push(`${name}:${weddingId}`);
        if (name === 'orders' && failing.has(weddingId)) throw new Error('falhou');
      }),
    });
    for (const name of ['guests', 'rsvp', 'orders']) registry.register(anonymizer(name));
    const logger = {
      runInContext: jest.fn(async (fn: () => Promise<void>) => fn()),
      error: jest.fn(),
      info: jest.fn(),
    };
    const cron = new AnonymizationCron(
      weddings as unknown as WeddingsService,
      registry,
      { now: () => NOW } as Clock,
      logger as unknown as PinoLogger,
    );
    return { cron, weddings, marked, calls, logger, failing };
  }

  it('runs every anonymizer and only then marks the wedding with the run instant (RF02)', async () => {
    const { cron, weddings, marked, calls } = setup(['wedding-a']);

    await cron.run();

    expect(weddings.listIdsDueForAnonymization).toHaveBeenCalledWith(NOW);
    expect(calls).toEqual([
      'guests:wedding-a',
      'rsvp:wedding-a',
      'orders:wedding-a',
      'mark:wedding-a',
    ]);
    expect(marked.get('wedding-a')).toEqual(NOW);
  });

  it('leaves a failed wedding unmarked, goes on and redoes it in the next run (RF04)', async () => {
    const { cron, marked, logger, failing } = setup(
      ['wedding-1', 'wedding-2', 'wedding-3'],
      new Set(['wedding-2']),
    );

    await cron.run();

    expect([...marked.keys()]).toEqual(['wedding-1', 'wedding-3']);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.runInContext).toHaveBeenCalledWith(expect.any(Function), {
      bindings: { weddingId: 'wedding-2' },
    });

    failing.clear();
    await cron.run();

    expect([...marked.keys()]).toEqual(['wedding-1', 'wedding-3', 'wedding-2']);
  });

  it('changes nothing when it runs again on the same day (RNF03)', async () => {
    const { cron, calls, marked } = setup(['wedding-a']);

    await cron.run();
    const after = calls.length;
    await cron.run();

    expect(calls).toHaveLength(after);
    expect(marked.get('wedding-a')).toEqual(NOW);
  });
});
