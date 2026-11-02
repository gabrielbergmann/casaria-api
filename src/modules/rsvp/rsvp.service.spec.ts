import type { Clock } from '../../common/time/clock';
import type { TransactionRunner } from '../../infra/prisma/transaction-runner';
import { InvitationNotFound } from '../guests/errors/invitation-not-found';
import type { GuestsService } from '../guests/guests.service';
import type { InvitationRecord } from '../guests/invitations.repository';
import type { CodeAttempts } from './code-attempts';
import {
  InvitationCodeBlocked,
  RsvpCompanionsExceeded,
  RsvpDeadlinePassed,
  RsvpInvalidAnswers,
} from './errors/rsvp-errors';
import type { RsvpRepository } from './rsvp.repository';
import { RsvpService } from './rsvp.service';

const WEDDING_A = 'wedding-a';
const WEDDING_B = 'wedding-b';
const IP = '203.0.113.7';

const guest = (id: string, origin: 'LIST' | 'COMPANION' = 'LIST', isChild = false) => ({
  id,
  invitationId: 'inv-a',
  name: `Pessoa ${id}`,
  isChild,
  phone: '+5511999990000',
  email: 'pessoa@example.com',
  origin,
});

const souza = (): InvitationRecord => ({
  id: 'inv-a',
  label: 'Família Souza',
  maxCompanions: 1,
  token: 'token-a',
  code: 'K7MQ2X',
  guests: [guest('ana'), guest('bia')],
});

/** Bloqueio por IP em memória, com a regra do CodeAttempts: 10 erros bloqueiam. */
function memoryAttempts() {
  const errors = new Map<string, number>();
  return {
    assertNotBlocked: jest.fn(async (ip: string) => {
      if ((errors.get(ip) ?? 0) >= 10) throw new InvitationCodeBlocked(3600);
    }),
    registerFailure: jest.fn(async (ip: string) => {
      errors.set(ip, (errors.get(ip) ?? 0) + 1);
    }),
  };
}

describe('RsvpService', () => {
  let invitations: Record<string, InvitationRecord[]>;
  const guests = {
    identifyByToken: jest.fn(
      async (weddingId: string, token: string) =>
        (invitations[weddingId] ?? []).find((inv) => inv.token === token) ?? null,
    ),
    identifyByCode: jest.fn(
      async (weddingId: string, code: string) =>
        (invitations[weddingId] ?? []).find(
          (inv) => inv.code === code.replace(/\W/g, '').toUpperCase(),
        ) ?? null,
    ),
    syncCompanions: jest.fn(async (_w: string, _i: string, companions: { id: string | null }[]) =>
      companions.map((companion, index) => companion.id ?? `new-companion-${index}`),
    ),
  };
  const repository = {
    findSettings: jest.fn(),
    saveSettings: jest.fn(),
    findResponses: jest.fn(),
    saveAnswers: jest.fn(),
  };
  const tx = { tag: 'tx' };
  const transactions = { run: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
  const clock = { now: jest.fn(() => new Date('2027-02-01T12:00:00.000Z')) };
  let attempts: ReturnType<typeof memoryAttempts>;
  let service: RsvpService;

  beforeEach(() => {
    jest.clearAllMocks();
    invitations = {
      [WEDDING_A]: [souza()],
      [WEDDING_B]: [{ ...souza(), id: 'inv-b', token: 'token-b', code: 'BBBBBB' }],
    };
    repository.findSettings.mockResolvedValue(null);
    repository.findResponses.mockResolvedValue([]);
    attempts = memoryAttempts();
    service = new RsvpService(
      repository as unknown as RsvpRepository,
      guests as unknown as GuestsService,
      attempts as unknown as CodeAttempts,
      transactions as unknown as TransactionRunner,
      clock as unknown as Clock,
    );
  });

  describe('settings', () => {
    it('defaults to open mode off and no deadline without a row', async () => {
      await expect(service.getPublicStatus(WEDDING_A)).resolves.toEqual({
        openModeEnabled: false,
        deadline: null,
        deadlinePassed: false,
      });
      expect(repository.saveSettings).not.toHaveBeenCalled();
    });

    it('tells the site that the deadline passed, compared on the server', async () => {
      repository.findSettings.mockResolvedValue({
        openModeEnabled: true,
        deadline: new Date('2027-01-31T23:59:00.000Z'),
      });

      await expect(service.getPublicStatus(WEDDING_A)).resolves.toMatchObject({
        deadlinePassed: true,
      });
    });
  });

  describe('identify', () => {
    it('identifies " k7m q2x " without contacts or dietary notes', async () => {
      repository.findResponses.mockResolvedValue([
        { guestId: 'ana', status: 'CONFIRMED', dietaryNotes: 'Celíaca', message: 'Oba' },
      ]);

      const view = await service.identify(WEDDING_A, { code: ' k7m q2x ' }, IP);

      expect(guests.identifyByCode).toHaveBeenCalledWith(WEDDING_A, ' k7m q2x ');
      expect(view).toMatchObject({ token: 'token-a', label: 'Família Souza', maxCompanions: 1 });
      expect(view.guests[0]).toEqual({
        id: 'ana',
        name: 'Pessoa ana',
        isChild: false,
        origin: 'LIST',
        status: 'CONFIRMED',
        hasDietaryNotes: true,
        message: 'Oba',
      });
      const json = JSON.stringify(view);
      expect(json).not.toContain('Celíaca');
      expect(json).not.toContain('99999');
      expect(json).not.toContain('example.com');
      expect(repository.findResponses).toHaveBeenCalledWith(WEDDING_A, ['ana', 'bia']);
    });

    it('answers the same invitation.not_found for a missing, foreign or regenerated value', async () => {
      const missing = await service.identify(WEDDING_A, { code: 'ZZZZZZ' }, IP).catch((e) => e);
      const foreign = await service.identify(WEDDING_A, { code: 'BBBBBB' }, IP).catch((e) => e);
      const foreignToken = await service
        .identify(WEDDING_A, { token: 'token-b' }, IP)
        .catch((e) => e);
      invitations[WEDDING_A][0].token = 'token-regenerated';
      const oldToken = await service.identify(WEDDING_A, { token: 'token-a' }, IP).catch((e) => e);

      for (const error of [missing, foreign, foreignToken, oldToken]) {
        expect(error).toBeInstanceOf(InvitationNotFound);
        expect({ ...error }).toEqual({ ...missing });
      }
    });

    it('blocks the 11th code of an IP after 10 errors, even a right one, but not the token', async () => {
      for (let i = 0; i < 10; i++) {
        await service.identify(WEDDING_A, { code: `WRONG${i}` }, IP).catch(() => undefined);
      }

      const eleventh = await service.identify(WEDDING_A, { code: 'K7MQ2X' }, IP).catch((e) => e);

      expect(eleventh).toBeInstanceOf(InvitationCodeBlocked);
      expect(eleventh).toMatchObject({ status: 429, code: 'invitation.code_blocked' });
      await expect(service.identify(WEDDING_A, { token: 'token-a' }, IP)).resolves.toMatchObject({
        label: 'Família Souza',
      });
      await expect(
        service.identify(WEDDING_A, { code: 'K7MQ2X' }, '198.51.100.1'),
      ).resolves.toBeDefined();
    });

    it('counts only wrong codes, never right codes or tokens', async () => {
      await service.identify(WEDDING_A, { code: 'K7MQ2X' }, IP);
      await service.identify(WEDDING_A, { token: 'token-a' }, IP);
      await service.identify(WEDDING_A, { token: 'wrong-token' }, IP).catch(() => undefined);

      expect(attempts.registerFailure).not.toHaveBeenCalled();
      expect(attempts.assertNotBlocked).toHaveBeenCalledTimes(1);
    });
  });

  describe('answerInvitation', () => {
    const fullAnswer = {
      token: 'token-a',
      answers: [
        { guestId: 'ana', status: 'CONFIRMED' as const, dietaryNotes: 'Celíaca', message: 'Oba' },
        { guestId: 'bia', status: 'DECLINED' as const, message: null },
      ],
      companions: [{ id: null, name: 'Caio', isChild: true, message: null }],
    };

    it('saves people and companions in one transaction, companions as confirmed', async () => {
      await service.answerInvitation(WEDDING_A, fullAnswer);

      expect(transactions.run).toHaveBeenCalledTimes(1);
      expect(guests.syncCompanions).toHaveBeenCalledWith(
        WEDDING_A,
        'inv-a',
        fullAnswer.companions,
        tx,
      );
      expect(repository.saveAnswers).toHaveBeenCalledWith(
        WEDDING_A,
        [
          fullAnswer.answers[0],
          fullAnswer.answers[1],
          {
            guestId: 'new-companion-0',
            status: 'CONFIRMED',
            dietaryNotes: undefined,
            message: null,
          },
        ],
        new Date('2027-02-01T12:00:00.000Z'),
        tx,
      );
    });

    it('keeps an omitted dietary note, deletes on null and replaces on text', async () => {
      await service.answerInvitation(WEDDING_A, {
        ...fullAnswer,
        answers: [
          { guestId: 'ana', status: 'CONFIRMED', message: null },
          { guestId: 'bia', status: 'CONFIRMED', dietaryNotes: null, message: null },
        ],
        companions: [],
      });

      const [, saved] = repository.saveAnswers.mock.calls[0];
      expect(saved[0]).not.toHaveProperty('dietaryNotes');
      expect(saved[1].dietaryNotes).toBeNull();
    });

    it.each([
      ['a missing person', { answers: [{ guestId: 'ana', status: 'CONFIRMED', message: null }] }],
      [
        'a person of another invitation',
        {
          answers: [
            { guestId: 'ana', status: 'CONFIRMED', message: null },
            { guestId: 'dani', status: 'CONFIRMED', message: null },
          ],
        },
      ],
    ])('saves nothing with %s', async (_case, change) => {
      await expect(
        service.answerInvitation(WEDDING_A, { ...fullAnswer, ...change } as typeof fullAnswer),
      ).rejects.toBeInstanceOf(RsvpInvalidAnswers);
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('saves nothing with 2 companions and limit 1', async () => {
      const companions = [
        { id: null, name: 'Caio', isChild: false, message: null },
        { id: null, name: 'Duda', isChild: false, message: null },
      ];

      await expect(
        service.answerInvitation(WEDDING_A, { ...fullAnswer, companions }),
      ).rejects.toBeInstanceOf(RsvpCompanionsExceeded);
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('refuses rsvp.deadline_passed once the clock passes the deadline, saving nothing', async () => {
      repository.findSettings.mockResolvedValue({
        openModeEnabled: false,
        deadline: new Date('2027-03-01T02:59:00.000Z'),
      });
      clock.now.mockReturnValueOnce(new Date('2027-03-01T03:00:00.000Z'));

      await expect(service.answerInvitation(WEDDING_A, fullAnswer)).rejects.toBeInstanceOf(
        RsvpDeadlinePassed,
      );
      expect(guests.identifyByToken).not.toHaveBeenCalled();
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('does not answer the invitation of another wedding with its token', async () => {
      await expect(
        service.answerInvitation(WEDDING_A, { ...fullAnswer, token: 'token-b' }),
      ).rejects.toBeInstanceOf(InvitationNotFound);
      expect(transactions.run).not.toHaveBeenCalled();
    });
  });
});
