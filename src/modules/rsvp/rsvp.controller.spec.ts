import type { OpenRsvpService } from './open-rsvp.service';
import type { RsvpReportService } from './rsvp-report.service';
import { RsvpController } from './rsvp.controller';
import type { RsvpService } from './rsvp.service';

describe('RsvpController', () => {
  const rsvp = { saveSettings: jest.fn(async (_w: string, settings: unknown) => settings) };
  const controller = new RsvpController(
    rsvp as unknown as RsvpService,
    {} as OpenRsvpService,
    {} as RsvpReportService,
  );
  const editor = { weddingId: 'wedding-a', role: 'editor' as const };

  it('stores 28/02/2027 23:59 in Brasília as 2027-03-01T02:59:00.000Z', async () => {
    const saved = await controller.saveSettings(editor, {
      openModeEnabled: true,
      deadline: '2027-02-28T23:59:00-03:00',
    });

    expect(rsvp.saveSettings).toHaveBeenCalledWith('wedding-a', {
      openModeEnabled: true,
      deadline: new Date('2027-03-01T02:59:00.000Z'),
    });
    expect(saved).toEqual({ openModeEnabled: true, deadline: '2027-03-01T02:59:00.000Z' });
  });
});
