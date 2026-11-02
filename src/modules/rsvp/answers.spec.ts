import type { InvitationRecord } from '../guests/invitations.repository';
import { assertCompleteAnswer, type CompanionAnswer, type GuestAnswer } from './answers';
import { RsvpCompanionsExceeded, RsvpInvalidAnswers } from './errors/rsvp-errors';

const person = (id: string, origin: 'LIST' | 'COMPANION' = 'LIST') => ({
  id,
  invitationId: 'inv-1',
  name: id,
  isChild: false,
  phone: null,
  email: null,
  origin,
});

const invitation: InvitationRecord = {
  id: 'inv-1',
  label: 'Família Souza',
  maxCompanions: 1,
  token: 'token',
  code: 'K7MQ2X',
  guests: [person('ana'), person('bia'), person('caio', 'COMPANION')],
};

const answer = (guestId: string): GuestAnswer => ({ guestId, status: 'CONFIRMED', message: null });
const companion = (id: string | null): CompanionAnswer => ({
  id,
  name: 'Caio',
  isChild: false,
  message: null,
});

describe('assertCompleteAnswer', () => {
  it('accepts one answer per person of the list and companions within the limit', () => {
    expect(() =>
      assertCompleteAnswer(invitation, [answer('ana'), answer('bia')], [companion('caio')]),
    ).not.toThrow();
    expect(() =>
      assertCompleteAnswer(invitation, [answer('bia'), answer('ana')], [companion(null)]),
    ).not.toThrow();
  });

  it.each([
    ['a missing person', [answer('ana')], []],
    ['a repeated person', [answer('ana'), answer('ana')], []],
    ['a person of another invitation', [answer('ana'), answer('bia'), answer('dani')], []],
    ['a person swapped for another invitation', [answer('ana'), answer('dani')], []],
    [
      'a companion answered as a person of the list',
      [answer('ana'), answer('bia'), answer('caio')],
      [],
    ],
    ['a companion id of another invitation', [answer('ana'), answer('bia')], [companion('dani')]],
    ['a list person sent as a companion', [answer('ana'), answer('bia')], [companion('ana')]],
  ])('refuses the whole answer with %s', (_case, answers, companions) => {
    expect(() => assertCompleteAnswer(invitation, answers, companions)).toThrow(RsvpInvalidAnswers);
  });

  it('refuses 2 companions with limit 1 with rsvp.companions_exceeded', () => {
    const error = (() => {
      try {
        assertCompleteAnswer(
          invitation,
          [answer('ana'), answer('bia')],
          [companion('caio'), companion(null)],
        );
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(RsvpCompanionsExceeded);
    expect(error).toMatchObject({ status: 422, code: 'rsvp.companions_exceeded' });
  });
});
