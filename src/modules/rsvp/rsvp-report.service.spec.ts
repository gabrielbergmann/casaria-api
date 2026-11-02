import type { Clock } from '../../common/time/clock';
import type { OpenRsvpRepository } from './open-rsvp.repository';
import type { RsvpRepository } from './rsvp.repository';
import { RsvpReportService } from './rsvp-report.service';

describe('RsvpReportService', () => {
  const responses = {
    countByAgeAndStatus: jest.fn(),
    listPeople: jest.fn(),
    listAllPeople: jest.fn(),
  };
  const openResponses = { countByStatus: jest.fn(), listAll: jest.fn() };
  const clock = { now: () => new Date('2027-03-01T02:00:00.000Z') };
  const service = new RsvpReportService(
    responses as unknown as RsvpRepository,
    openResponses as unknown as OpenRsvpRepository,
    clock as unknown as Clock,
  );

  beforeEach(() => jest.clearAllMocks());

  it('totals 3/1/1 adults, 0/2/0 children and 1/0 visitors from the database counts', async () => {
    responses.countByAgeAndStatus.mockResolvedValue([
      { isChild: false, status: 'CONFIRMED', count: 3 },
      { isChild: false, status: 'DECLINED', count: 1 },
      { isChild: false, status: null, count: 1 },
      { isChild: true, status: null, count: 2 },
    ]);
    openResponses.countByStatus.mockResolvedValue({ CONFIRMED: 1 });

    await expect(service.summary('wedding-a')).resolves.toEqual({
      adults: { confirmed: 3, pending: 1, declined: 1 },
      children: { confirmed: 0, pending: 2, declined: 0 },
      visitors: { confirmed: 1, declined: 0 },
    });
    expect(responses.countByAgeAndStatus).toHaveBeenCalledWith('wedding-a');
    expect(openResponses.countByStatus).toHaveBeenCalledWith('wedding-a');
  });

  it('pages people 50 at a time with the presence filter', async () => {
    responses.listPeople.mockResolvedValue({ items: [], total: 0 });

    await expect(service.people('wedding-a', 'PENDING', 2)).resolves.toMatchObject({
      page: 2,
      pageSize: 50,
    });
    expect(responses.listPeople).toHaveBeenCalledWith('wedding-a', 'PENDING', 50, 50);
  });

  it('names the file with the date in Brasília', async () => {
    responses.listAllPeople.mockResolvedValue([]);
    openResponses.listAll.mockResolvedValue([]);

    const csv = await service.export('wedding-a', 'csv');
    const xlsx = await service.export('wedding-a', 'xlsx');

    expect(csv).toMatchObject({
      filename: 'rsvp-2027-02-28.csv',
      contentType: 'text/csv; charset=utf-8',
    });
    expect(xlsx.filename).toBe('rsvp-2027-02-28.xlsx');
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
  });
});
