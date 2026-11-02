import type { Clock } from '../../common/time/clock';
import {
  OpenRsvpResponseNotFound,
  RsvpDeadlinePassed,
  RsvpOpenModeDisabled,
} from './errors/rsvp-errors';
import type { OpenRsvpRepository } from './open-rsvp.repository';
import { OpenRsvpService } from './open-rsvp.service';
import type { RsvpService } from './rsvp.service';

describe('OpenRsvpService', () => {
  const repository = { create: jest.fn(), listPage: jest.fn(), delete: jest.fn() };
  const rsvp = { getSettings: jest.fn() };
  const clock = { now: jest.fn(() => new Date('2027-02-01T12:00:00.000Z')) };
  const service = new OpenRsvpService(
    repository as unknown as OpenRsvpRepository,
    rsvp as unknown as RsvpService,
    clock as unknown as Clock,
  );
  const visitor = {
    name: 'Davi',
    phone: '+5511999990000',
    email: null,
    status: 'CONFIRMED' as const,
    message: 'Parabéns!',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rsvp.getSettings.mockResolvedValue({ openModeEnabled: true, deadline: null });
  });

  it('saves the visitor in open_rsvp_responses, without an invitation', async () => {
    await service.answer('wedding-a', visitor);

    expect(repository.create).toHaveBeenCalledWith('wedding-a', visitor);
  });

  it('saves nothing while the open mode is off', async () => {
    rsvp.getSettings.mockResolvedValue({ openModeEnabled: false, deadline: null });

    const error = await service.answer('wedding-a', visitor).catch((e) => e);

    expect(error).toBeInstanceOf(RsvpOpenModeDisabled);
    expect(error).toMatchObject({ status: 403, code: 'rsvp.open_mode_disabled' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('saves nothing after the deadline', async () => {
    rsvp.getSettings.mockResolvedValue({
      openModeEnabled: true,
      deadline: new Date('2027-01-31T00:00:00.000Z'),
    });

    await expect(service.answer('wedding-a', visitor)).rejects.toBeInstanceOf(RsvpDeadlinePassed);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('deletes only a visitor of the wedding', async () => {
    repository.delete.mockResolvedValue(false);

    await expect(
      service.delete('wedding-a', '01890000-0000-7000-8000-0000000000b1'),
    ).rejects.toBeInstanceOf(OpenRsvpResponseNotFound);
    await expect(service.delete('wedding-a', 'nao-e-uuid')).rejects.toBeInstanceOf(
      OpenRsvpResponseNotFound,
    );
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });
});
