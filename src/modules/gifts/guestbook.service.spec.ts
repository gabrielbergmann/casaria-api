import type { SiteService } from '../site/site.service';
import { GuestbookDisabled, GuestbookMessageNotFound } from './errors/guestbook-errors';
import type { GuestbookMessageRecord, GuestbookRepository } from './guestbook.repository';
import { GuestbookService } from './guestbook.service';

const MESSAGE_ID = '0199f1a1-0000-7000-8000-0000000000e1';
const CREATED_AT = new Date('2027-05-16T12:00:00.000Z');

const record = (overrides: Partial<GuestbookMessageRecord> = {}): GuestbookMessageRecord => ({
  id: MESSAGE_ID,
  authorName: 'Davi',
  body: 'Felicidades!',
  status: 'PENDING',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

describe('GuestbookService', () => {
  const repository = {
    create: jest.fn(),
    listPage: jest.fn(),
    countPending: jest.fn(),
    setStatus: jest.fn(),
  };
  const site = { isPublishedSectionEnabled: jest.fn() };
  const service = new GuestbookService(
    repository as unknown as GuestbookRepository,
    site as unknown as SiteService,
  );
  const message = { authorName: 'Davi', body: 'Felicidades!' };

  beforeEach(() => {
    jest.clearAllMocks();
    site.isPublishedSectionEnabled.mockResolvedValue(true);
    repository.create.mockResolvedValue(record());
    repository.listPage.mockResolvedValue([]);
    repository.countPending.mockResolvedValue(0);
  });

  describe('post', () => {
    it('saves a PENDING message with only the name and the text (RF02)', async () => {
      const created = await service.post('wedding-a', message);

      // Só nome e texto: o status nasce PENDING pelo padrão do banco.
      expect(repository.create).toHaveBeenCalledWith('wedding-a', message);
      expect(created.status).toBe('PENDING');
      expect(site.isPublishedSectionEnabled).toHaveBeenCalledWith('wedding-a', 'guestbook');
    });

    it('refuses with guestbook.disabled while the published site has no active guestbook (RF05)', async () => {
      site.isPublishedSectionEnabled.mockResolvedValue(false);

      const error = await service.post('wedding-a', message).catch((e) => e);

      expect(error).toBeInstanceOf(GuestbookDisabled);
      expect(error).toMatchObject({ status: 404, code: 'guestbook.disabled' });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('listApproved', () => {
    it('lists only APPROVED messages of the wedding, with the next cursor after 50 (RF06)', async () => {
      const rows = Array.from({ length: 51 }, (_, index) =>
        record({ id: `id-${index}`, status: 'APPROVED' }),
      );
      repository.listPage.mockResolvedValue(rows);

      const page = await service.listApproved('wedding-a', undefined);

      expect(repository.listPage).toHaveBeenCalledWith('wedding-a', 'APPROVED', undefined, 50);
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBe('id-49');
    });

    it('refuses with guestbook.disabled while the guestbook is off (RF05)', async () => {
      site.isPublishedSectionEnabled.mockResolvedValue(false);

      await expect(service.listApproved('wedding-a', undefined)).rejects.toBeInstanceOf(
        GuestbookDisabled,
      );
      expect(repository.listPage).not.toHaveBeenCalled();
    });
  });

  describe('listForPanel', () => {
    it('reads one tab of the wedding with the pending count, even with the guestbook off (RF07)', async () => {
      site.isPublishedSectionEnabled.mockResolvedValue(false);
      repository.listPage.mockResolvedValue([record({ status: 'HIDDEN' })]);
      repository.countPending.mockResolvedValue(3);

      const page = await service.listForPanel('wedding-a', 'HIDDEN', MESSAGE_ID);

      expect(repository.listPage).toHaveBeenCalledWith('wedding-a', 'HIDDEN', MESSAGE_ID, 50);
      expect(repository.countPending).toHaveBeenCalledWith('wedding-a');
      expect(page).toMatchObject({ pendingCount: 3, nextCursor: null });
      expect(page.items).toHaveLength(1);
    });
  });

  describe('moderate', () => {
    it.each(['APPROVED', 'REJECTED', 'HIDDEN'] as const)(
      'moves a message of the wedding to %s (RF08, RF09)',
      async (status) => {
        repository.setStatus.mockResolvedValue(record({ status }));

        const moderated = await service.moderate('wedding-a', MESSAGE_ID, status);

        expect(repository.setStatus).toHaveBeenCalledWith('wedding-a', MESSAGE_ID, status);
        expect(moderated.status).toBe(status);
      },
    );

    it('answers guestbook.message_not_found for a message of another wedding (RNF01)', async () => {
      repository.setStatus.mockResolvedValue(null);

      const error = await service.moderate('wedding-a', MESSAGE_ID, 'APPROVED').catch((e) => e);

      expect(error).toBeInstanceOf(GuestbookMessageNotFound);
      expect(error).toMatchObject({ status: 404, code: 'guestbook.message_not_found' });
    });

    it('answers guestbook.message_not_found for an id that is not a uuid, without querying', async () => {
      await expect(service.moderate('wedding-a', 'abc', 'HIDDEN')).rejects.toBeInstanceOf(
        GuestbookMessageNotFound,
      );
      expect(repository.setStatus).not.toHaveBeenCalled();
    });
  });
});
