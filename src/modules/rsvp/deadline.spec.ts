import { assertBeforeDeadline, isDeadlinePassed } from './deadline';
import { RsvpDeadlinePassed } from './errors/rsvp-errors';

describe('RSVP deadline', () => {
  const deadline = new Date('2027-03-01T02:59:00.000Z');

  it.each([
    [null, '2099-01-01T00:00:00.000Z', false],
    [deadline, '2027-03-01T02:58:59.999Z', false],
    [deadline, '2027-03-01T02:59:00.000Z', false],
    [deadline, '2027-03-01T02:59:00.001Z', true],
  ])('with deadline %p at %p, passed is %p', (limit, now, expected) => {
    expect(isDeadlinePassed(limit, new Date(now))).toBe(expected);
  });

  it('answers 409 rsvp.deadline_passed with the deadline', () => {
    const error = (() => {
      try {
        assertBeforeDeadline(deadline, new Date('2027-03-02T00:00:00.000Z'));
      } catch (e) {
        return e as RsvpDeadlinePassed;
      }
    })();

    expect(error).toBeInstanceOf(RsvpDeadlinePassed);
    expect(error).toMatchObject({ status: 409, code: 'rsvp.deadline_passed' });
    expect(error.extensions).toEqual({ deadline: '2027-03-01T02:59:00.000Z' });
  });
});
