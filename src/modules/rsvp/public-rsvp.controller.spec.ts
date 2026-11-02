import { PATH_METADATA } from '@nestjs/common/constants';
import type { OpenRsvpService } from './open-rsvp.service';
import { PublicRsvpController } from './public-rsvp.controller';
import type { RsvpService } from './rsvp.service';

describe('PublicRsvpController', () => {
  const rsvp = { identify: jest.fn(), answerInvitation: jest.fn() };
  const open = { answer: jest.fn() };
  const controller = new PublicRsvpController(
    rsvp as unknown as RsvpService,
    open as unknown as OpenRsvpService,
  );
  const site = { weddingId: 'wedding-a' };
  const view = { token: 't', label: 'F', maxCompanions: 0, deadline: null, guests: [] };

  beforeEach(() => jest.clearAllMocks());

  it('never takes the token from the path', () => {
    const paths = [
      Reflect.getMetadata(PATH_METADATA, PublicRsvpController),
      ...Object.getOwnPropertyNames(PublicRsvpController.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) =>
          Reflect.getMetadata(
            PATH_METADATA,
            PublicRsvpController.prototype[name as keyof PublicRsvpController],
          ),
        ),
    ];

    expect(paths).toEqual([
      'public/sites/:slug',
      'rsvp',
      'invitations/identify',
      'rsvp/invitation',
      'rsvp/open',
    ]);
  });

  it('identifies by code with the weddingId of the guard and the IP', async () => {
    rsvp.identify.mockResolvedValue({ ...view, deadline: new Date('2027-03-01T02:59:00.000Z') });

    const result = await controller.identify(site, { code: 'k7m q2x' }, '203.0.113.7');

    expect(rsvp.identify).toHaveBeenCalledWith('wedding-a', { code: 'k7m q2x' }, '203.0.113.7');
    expect(result.deadline).toBe('2027-03-01T02:59:00.000Z');
  });

  it('sends new companions with a null id', async () => {
    rsvp.answerInvitation.mockResolvedValue(view);

    await controller.answerInvitation(site, {
      token: 't',
      answers: [],
      companions: [{ name: 'Caio', isChild: true }],
    });

    expect(rsvp.answerInvitation).toHaveBeenCalledWith('wedding-a', {
      token: 't',
      answers: [],
      companions: [{ id: null, name: 'Caio', isChild: true, message: null }],
    });
  });

  it('passes the visitor without dietary notes', async () => {
    await controller.answerOpen(site, {
      name: 'Davi',
      phone: '+5511999990000',
      status: 'CONFIRMED',
    });

    expect(open.answer).toHaveBeenCalledWith('wedding-a', {
      name: 'Davi',
      status: 'CONFIRMED',
      phone: '+5511999990000',
      email: null,
      message: null,
    });
  });
});
