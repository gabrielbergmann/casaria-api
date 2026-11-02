import { RsvpDeadlinePassed } from './errors/rsvp-errors';

/** O prazo vale até o instante dele, inclusive; sem prazo, nunca passa (spec 010 RF08). */
export const isDeadlinePassed = (deadline: Date | null, now: Date) =>
  deadline !== null && now.getTime() > deadline.getTime();

/** Recusa respostas e edições dos dois modos depois do prazo, comparado no servidor. */
export function assertBeforeDeadline(deadline: Date | null, now: Date): void {
  if (isDeadlinePassed(deadline, now)) throw new RsvpDeadlinePassed(deadline);
}
