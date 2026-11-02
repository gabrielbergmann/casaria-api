import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema';
import { WeddingNotFound } from './errors/wedding-not-found';
import { WeddingSlugInvalid } from './errors/wedding-slug-invalid';
import { WeddingSlugUnavailable } from './errors/wedding-slug-unavailable';
import { WeddingsRepository } from './weddings.repository';
import { WeddingsService } from './weddings.service';

describe('WeddingsService', () => {
  const repository = {
    findIdBySlug: jest.fn(),
    findRedirectTarget: jest.fn(),
    exists: jest.fn(),
    findSlug: jest.fn(),
    isSlugTakenByAnother: jest.fn(),
    changeSlug: jest.fn(),
    listIds: jest.fn(),
    listNotAnonymizedUntil: jest.fn(),
    markAnonymized: jest.fn(),
    create: jest.fn(),
    findDetails: jest.fn(),
    updateDetails: jest.fn(),
    delete: jest.fn(),
  };
  const files = { deleteWeddingFiles: jest.fn() };
  const config = { get: () => 'casaria.test' } as unknown as ConfigService<Env, true>;
  const service = new WeddingsService(repository as unknown as WeddingsRepository, config, files);
  const expiresAt = new Date('2027-06-01T00:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    // Banco falso: ana-e-bia é o slug atual; ana-bia redireciona para ele até expiresAt.
    repository.findIdBySlug.mockImplementation(async (slug: string) =>
      slug === 'ana-e-bia' ? 'wedding-a' : null,
    );
    repository.findRedirectTarget.mockImplementation(async (slug: string, now: Date) =>
      slug === 'ana-bia' && now < expiresAt ? 'ana-e-bia' : null,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('resolveHost', () => {
    it('resolves the current slug to the wedding', async () => {
      await expect(service.resolveHost('ana-e-bia.casaria.test')).resolves.toEqual({
        kind: 'wedding',
        weddingId: 'wedding-a',
        slug: 'ana-e-bia',
      });
    });

    it('redirects an old slug before expires_at and forgets it afterwards', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2027-05-31T23:59:59Z'));
      await expect(service.resolveHost('ana-bia.casaria.test')).resolves.toEqual({
        kind: 'redirect',
        slug: 'ana-e-bia',
      });

      jest.setSystemTime(new Date('2027-06-01T00:00:01Z'));
      await expect(service.resolveHost('ana-bia.casaria.test')).resolves.toEqual({
        kind: 'not_found',
      });
    });

    it('answers not_found for unknown hosts without touching the database', async () => {
      for (const host of ['admin.casaria.test', 'a.b.casaria.test', 'outro.com', '10.0.0.1']) {
        await expect(service.resolveHost(host)).resolves.toEqual({ kind: 'not_found' });
      }
      expect(repository.findIdBySlug).not.toHaveBeenCalled();
    });

    it('leaves the panel, the api, the root and www alone', async () => {
      for (const host of [
        'app.casaria.test',
        'api.casaria.test',
        'casaria.test',
        'www.casaria.test',
      ]) {
        await expect(service.resolveHost(host)).resolves.toEqual({ kind: 'not_wedding_host' });
      }
      expect(repository.findIdBySlug).not.toHaveBeenCalled();
    });

    it('makes at most two lookups for a subdomain', async () => {
      await service.resolveHost('ninguem.casaria.test');

      expect(repository.findIdBySlug).toHaveBeenCalledTimes(1);
      expect(repository.findRedirectTarget).toHaveBeenCalledTimes(1);
    });
  });

  describe('findIdBySlug', () => {
    it('resolves only the current slug', async () => {
      await expect(service.findIdBySlug('ana-e-bia')).resolves.toBe('wedding-a');
      await expect(service.findIdBySlug('ana-bia')).rejects.toBeInstanceOf(WeddingNotFound);
    });

    it('rejects an invalid slug without touching the database', async () => {
      await expect(service.findIdBySlug('Ana_Bia')).rejects.toBeInstanceOf(WeddingNotFound);
      expect(repository.findIdBySlug).not.toHaveBeenCalled();
    });
  });

  describe('changeSlug', () => {
    beforeEach(() => repository.findSlug.mockResolvedValue('ana-bia'));

    it.each([
      'ab',
      'x'.repeat(64),
      'Ana',
      'ana_bia',
      'ána',
      '-ana',
      'ana-',
      'ana--bia',
      'admin',
      'www',
    ])('rejects %s with 400 wedding.slug_invalid', async (slug) => {
      const error = await service.changeSlug('wedding-a', slug).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WeddingSlugInvalid);
      expect(error).toMatchObject({ status: 400, code: 'wedding.slug_invalid' });
      expect(repository.changeSlug).not.toHaveBeenCalled();
    });

    it('rejects a slug in use by another wedding with 409 and changes nothing', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(true);

      const error = await service.changeSlug('wedding-a', 'ze-e-lu').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WeddingSlugUnavailable);
      expect(error).toMatchObject({ status: 409, code: 'wedding.slug_unavailable' });
      expect(repository.isSlugTakenByAnother).toHaveBeenCalledWith(
        'wedding-a',
        'ze-e-lu',
        expect.any(Date),
      );
      expect(repository.changeSlug).not.toHaveBeenCalled();
    });

    it('changes the slug keeping the old one for the redirect', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(false);
      repository.changeSlug.mockResolvedValue(true);

      await service.changeSlug('wedding-a', 'ana-e-bia');

      expect(repository.changeSlug).toHaveBeenCalledWith(
        'wedding-a',
        'ana-bia',
        'ana-e-bia',
        expect.any(Date),
      );
    });

    it('turns a unique-index collision into 409', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(false);
      repository.changeSlug.mockResolvedValue(false);

      await expect(service.changeSlug('wedding-a', 'ana-e-bia')).rejects.toBeInstanceOf(
        WeddingSlugUnavailable,
      );
    });

    it('does nothing when the slug is the same', async () => {
      await service.changeSlug('wedding-a', 'ana-bia');

      expect(repository.changeSlug).not.toHaveBeenCalled();
    });

    it('rejects a wedding that does not exist', async () => {
      repository.findSlug.mockResolvedValue(null);

      await expect(service.changeSlug('wedding-x', 'ana-e-bia')).rejects.toBeInstanceOf(
        WeddingNotFound,
      );
    });
  });

  describe('create', () => {
    const details = {
      coupleName: 'Ana & Bia',
      weddingDate: new Date('2027-11-20T19:00:00Z'),
      slug: 'ana-e-bia',
    };

    it('creates the wedding inside the given transaction', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(false);
      repository.create.mockResolvedValue('wedding-new');
      const tx = {} as never;

      await expect(service.create(details, tx)).resolves.toBe('wedding-new');
      expect(repository.isSlugTakenByAnother).toHaveBeenCalledWith(
        null,
        'ana-e-bia',
        expect.any(Date),
      );
      expect(repository.create).toHaveBeenCalledWith(details, tx);
    });

    it('creates nothing when the slug is taken', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(true);

      await expect(service.create(details)).rejects.toBeInstanceOf(WeddingSlugUnavailable);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('turns a slug collision during the insert into 409', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(false);
      repository.create.mockResolvedValue(null);

      await expect(service.create(details)).rejects.toBeInstanceOf(WeddingSlugUnavailable);
    });
  });

  describe('update', () => {
    const current = {
      coupleName: 'Ana & Bia',
      weddingDate: new Date('2027-11-20T19:00:00Z'),
      slug: 'ana-bia',
    };

    beforeEach(() => {
      repository.findSlug.mockResolvedValue('ana-bia');
      repository.findDetails.mockResolvedValue(current);
    });

    it('changes the slug with the redirect and saves name and date', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(false);
      repository.changeSlug.mockResolvedValue(true);
      const weddingDate = new Date('2027-12-01T20:00:00Z');

      await service.update('wedding-a', {
        slug: 'ana-e-bia',
        coupleName: 'Ana e Bia',
        weddingDate,
      });

      expect(repository.changeSlug).toHaveBeenCalledWith(
        'wedding-a',
        'ana-bia',
        'ana-e-bia',
        expect.any(Date),
      );
      expect(repository.updateDetails).toHaveBeenCalledWith('wedding-a', {
        coupleName: 'Ana e Bia',
        weddingDate,
      });
    });

    it('saves nothing when the new slug is unavailable', async () => {
      repository.isSlugTakenByAnother.mockResolvedValue(true);

      await expect(
        service.update('wedding-a', { slug: 'ze-e-lu', coupleName: 'Ana e Bia' }),
      ).rejects.toBeInstanceOf(WeddingSlugUnavailable);
      expect(repository.updateDetails).not.toHaveBeenCalled();
    });

    it('returns the saved details', async () => {
      await expect(service.update('wedding-a', { coupleName: 'Ana e Bia' })).resolves.toEqual(
        current,
      );
      expect(repository.changeSlug).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the files first and then the wedding', async () => {
      const order: string[] = [];
      files.deleteWeddingFiles.mockImplementation(async () => order.push('files'));
      repository.delete.mockImplementation(async () => order.push('database'));

      await service.delete('wedding-a');

      expect(files.deleteWeddingFiles).toHaveBeenCalledWith('wedding-a');
      expect(order).toEqual(['files', 'database']);
    });

    it('keeps the wedding in the database when the storage fails', async () => {
      files.deleteWeddingFiles.mockRejectedValue(new Error('storage down'));

      await expect(service.delete('wedding-a')).rejects.toThrow('storage down');
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('listIdsDueForAnonymization (spec 015 RF01)', () => {
    it('keeps only the weddings whose 6 months already came, in the São Paulo calendar', async () => {
      repository.listNotAnonymizedUntil.mockResolvedValue([
        { id: 'due', weddingDate: new Date('2027-03-10T19:00:00.000Z') },
        { id: 'tomorrow', weddingDate: new Date('2027-03-11T19:00:00.000Z') },
      ]);
      const now = new Date('2027-09-10T05:00:00.000Z');

      await expect(service.listIdsDueForAnonymization(now)).resolves.toEqual(['due']);
      expect(repository.listNotAnonymizedUntil).toHaveBeenCalledWith(now);
    });
  });
});
