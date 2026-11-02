import type { Clock } from '../../common/time/clock';
import type { TransactionRunner } from '../../infra/prisma/transaction-runner';
import type { MediaService } from '../media/media.service';
import type { MediaUsageChecker } from '../media/media-usage';
import { WeddingNotFound } from '../weddings/errors/wedding-not-found';
import type { WeddingsService } from '../weddings/weddings.service';
import { SiteDocumentTooLarge } from './errors/site-document-too-large';
import { SiteInvalidAlbumMedia } from './errors/site-invalid-album-media';
import { SiteInvalidConfig } from './errors/site-invalid-config';
import { initialSiteConfig } from './initial-site-config';
import type { SiteConfig } from './site-config.schema';
import type { SiteRepository } from './site.repository';
import { SiteService } from './site.service';

const COVER = '0199f1a1-0000-7000-8000-0000000000c1';
const OTHER = '0199f1a1-0000-7000-8000-0000000000c2';
const GALLERY = '0199f1a1-0000-7000-8000-0000000000c3';
const UPDATED_AT = new Date('2026-10-25T12:00:00Z');
const ALBUM_1 = '0199f1a1-0000-7000-8000-0000000000a1';
const ALBUM_2 = '0199f1a1-0000-7000-8000-0000000000a2';
const AT_WEDDING = new Date('2027-05-15T19:00:00.000Z');
const AFTER = new Date('2027-05-15T19:00:01.000Z');

const withCover = (config: SiteConfig, coverMediaId: string | null): SiteConfig => ({
  ...config,
  theme: { ...config.theme, coverMediaId },
});

const view = (id: string) => ({
  id,
  width: 100,
  height: 100,
  urls: { sm: `sm-${id}`, md: `md-${id}`, lg: `lg-${id}`, og: `https://storage.test/${id}/og.jpg` },
});

describe('SiteService', () => {
  const repository = {
    find: jest.fn(),
    isPublished: jest.fn(),
    saveDraft: jest.fn(),
    publish: jest.fn(),
  };
  const weddings = { getDetails: jest.fn(), findIdBySlug: jest.fn() };
  const media = { resolve: jest.fn(), registerUsageChecker: jest.fn() };
  const tx = { tag: 'tx' };
  const transactions = { run: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
  // Padrão: depois do casamento (15/05/2027 19h UTC), com o site inteiro no ar.
  const clock = { now: jest.fn(() => AFTER) };
  const service = new SiteService(
    repository as unknown as SiteRepository,
    weddings as unknown as WeddingsService,
    media as unknown as MediaService,
    transactions as unknown as TransactionRunner,
    clock as unknown as Clock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    clock.now.mockReturnValue(AFTER);
    weddings.getDetails.mockResolvedValue({
      coupleName: 'Ana & Bia',
      weddingDate: new Date('2027-05-15T19:00:00.000Z'),
      slug: 'ana-e-bia',
    });
    media.resolve.mockImplementation(async (_weddingId: string, ids: string[]) =>
      Object.fromEntries(ids.filter((id) => id !== OTHER).map((id) => [id, view(id)])),
    );
  });

  describe('getForPanel', () => {
    it('returns the initial document without saving when there is no draft', async () => {
      repository.find.mockResolvedValue(null);

      const site = await service.getForPanel('wedding-a');

      expect(site.draft).toEqual(initialSiteConfig());
      expect(site).toMatchObject({ publishedAt: null, updatedAt: null, coupleName: 'Ana & Bia' });
      expect(repository.saveDraft).not.toHaveBeenCalled();
      expect(repository.publish).not.toHaveBeenCalled();
    });

    it('resolves the images of the draft of its own wedding', async () => {
      const draft = withCover(initialSiteConfig(), COVER);
      repository.find.mockResolvedValue({
        draft,
        published: null,
        publishedAt: null,
        updatedAt: UPDATED_AT,
      });

      const site = await service.getForPanel('wedding-a');

      expect(media.resolve).toHaveBeenCalledWith('wedding-a', [COVER]);
      expect(site.media[COVER].urls.og).toContain(COVER);
      expect(site.updatedAt).toBe(UPDATED_AT);
    });
  });

  describe('saveDraft', () => {
    it('validates and replaces the whole draft', async () => {
      const draft = withCover(initialSiteConfig(), COVER);
      repository.find.mockResolvedValue({
        draft,
        published: null,
        publishedAt: null,
        updatedAt: UPDATED_AT,
      });

      await service.saveDraft('wedding-a', draft);

      expect(repository.saveDraft).toHaveBeenCalledWith('wedding-a', draft);
      expect(repository.publish).not.toHaveBeenCalled();
    });

    it('answers site.invalid_config with the fields and keeps the draft', async () => {
      const draft = initialSiteConfig();
      draft.theme.colors.text = '#FFF';

      const error = await service.saveDraft('wedding-a', draft).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SiteInvalidConfig);
      expect((error as SiteInvalidConfig).errors).toEqual([
        { path: 'theme.colors.text', message: 'Use uma cor no formato #RRGGBB.' },
      ]);
      expect(repository.saveDraft).not.toHaveBeenCalled();
    });

    it('answers site.document_too_large for 100 KB plus 1 byte, before the schema', async () => {
      const draft = initialSiteConfig();
      const story = draft.sections.find((section) => section.type === 'story');
      const size = () => Buffer.byteLength(JSON.stringify(draft));
      if (story.type === 'story') story.content.text = 'a'.repeat(100 * 1024 - size() + 1);
      expect(size()).toBe(100 * 1024 + 1);

      await expect(service.saveDraft('wedding-a', draft)).rejects.toBeInstanceOf(
        SiteDocumentTooLarge,
      );
      expect(repository.saveDraft).not.toHaveBeenCalled();
    });

    it('accepts exactly 100 KB', async () => {
      const draft = initialSiteConfig();
      const story = draft.sections.find((section) => section.type === 'story');
      const size = () => Buffer.byteLength(JSON.stringify(draft));
      if (story.type === 'story') story.content.text = 'a'.repeat(100 * 1024 - size());
      repository.find.mockResolvedValue({
        draft,
        published: null,
        publishedAt: null,
        updatedAt: UPDATED_AT,
      });

      await service.saveDraft('wedding-a', draft);

      expect(repository.saveDraft).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('publishes the initial document when nothing was saved, inside a transaction', async () => {
      repository.find.mockResolvedValue(null);

      const { publishedAt } = await service.publish('wedding-a');

      expect(repository.find).toHaveBeenCalledWith('wedding-a', tx);
      expect(repository.publish).toHaveBeenCalledWith(
        'wedding-a',
        initialSiteConfig(),
        publishedAt,
        tx,
      );
    });

    it('copies the saved draft, even with empty sections', async () => {
      const draft = withCover(initialSiteConfig(), COVER);
      repository.find.mockResolvedValue({
        draft,
        published: null,
        publishedAt: null,
        updatedAt: UPDATED_AT,
      });

      await service.publish('wedding-a');

      expect(repository.publish).toHaveBeenCalledWith('wedding-a', draft, expect.any(Date), tx);
    });
  });

  describe('public site', () => {
    it('answers 404 for a wedding that was never published, even with a draft', async () => {
      weddings.findIdBySlug.mockResolvedValue('wedding-a');
      repository.isPublished.mockResolvedValue(false);

      await expect(service.findPublishedWeddingId('ana-e-bia')).rejects.toBeInstanceOf(
        WeddingNotFound,
      );
    });

    it('serves only the published version, with the images of its own wedding', async () => {
      const draft = withCover(initialSiteConfig(), OTHER);
      const published = withCover(initialSiteConfig(), COVER);
      repository.find.mockResolvedValue({
        draft,
        published,
        publishedAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      });

      const site = await service.getPublic('wedding-a');

      expect(site.config).toBe(published);
      expect(media.resolve).toHaveBeenCalledWith('wedding-a', [COVER]);
      expect(Object.keys(site.media)).toEqual([COVER]);
    });

    it('returns null while there is no published version', async () => {
      repository.find.mockResolvedValue({
        draft: initialSiteConfig(),
        published: null,
        publishedAt: null,
        updatedAt: UPDATED_AT,
      });

      await expect(service.getPublic('wedding-a')).resolves.toBeNull();
      await expect(service.getPageMeta('wedding-a')).resolves.toBeNull();
    });
  });

  describe('getPageMeta', () => {
    it('derives title and description from the wedding and og:image from the published cover', async () => {
      const published = withCover(initialSiteConfig(), COVER);
      repository.find.mockResolvedValue({
        draft: withCover(initialSiteConfig(), GALLERY),
        published,
        publishedAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      });

      await expect(service.getPageMeta('wedding-a')).resolves.toEqual({
        title: 'Ana & Bia',
        description: 'Casamento em 15 de maio de 2027',
        ogImage: `https://storage.test/${COVER}/og.jpg`,
      });
    });

    it('has no og:image without a cover or when the cover no longer resolves', async () => {
      for (const cover of [null, OTHER]) {
        repository.find.mockResolvedValue({
          draft: initialSiteConfig(),
          published: withCover(initialSiteConfig(), cover),
          publishedAt: UPDATED_AT,
          updatedAt: UPDATED_AT,
        });

        await expect(service.getPageMeta('wedding-a')).resolves.toMatchObject({ ogImage: null });
      }
    });
  });

  describe('post-wedding sections (spec 014)', () => {
    const postWedding = (albumIds: string[], enabled = true): SiteConfig => {
      const config = withCover(initialSiteConfig(), COVER);
      config.sections = config.sections.map((section) => {
        if (section.type === 'album') {
          return { ...section, enabled, content: { heading: 'Nosso dia', mediaIds: albumIds } };
        }
        if (section.type === 'thanks') {
          return { ...section, enabled, content: { heading: '', text: '<b>Obrigado</b>!' } };
        }
        if (section.type === 'gallery') return { ...section, content: { mediaIds: [GALLERY] } };
        return section;
      });
      return config;
    };
    const published = (config: SiteConfig) => ({
      draft: initialSiteConfig(),
      published: config,
      publishedAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    });
    const types = (config: SiteConfig) => config.sections.map((section) => section.type);

    it('saves the album in the new order, keeping gallery, cover and the plain text (RF02)', async () => {
      const draft = postWedding([ALBUM_2, ALBUM_1]);

      await service.saveDraft('wedding-a', draft);

      const [, saved] = repository.saveDraft.mock.calls[0] as [string, SiteConfig];
      expect(saved.sections.find((s) => s.type === 'album')?.content).toEqual({
        heading: 'Nosso dia',
        mediaIds: [ALBUM_2, ALBUM_1],
      });
      expect(saved.sections.find((s) => s.type === 'thanks')?.content).toMatchObject({
        text: '<b>Obrigado</b>!',
      });
      expect(saved.sections.find((s) => s.type === 'gallery')?.content).toEqual({
        mediaIds: [GALLERY],
      });
      expect(saved.theme.coverMediaId).toBe(COVER);
      expect(media.resolve).toHaveBeenCalledWith('wedding-a', [ALBUM_2, ALBUM_1]);
    });

    it('answers site.invalid_album_media for a photo of another wedding and keeps the draft (RF03)', async () => {
      const error = await service
        .saveDraft('wedding-a', postWedding([ALBUM_1, OTHER]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SiteInvalidAlbumMedia);
      expect(error).toMatchObject({ status: 422, code: 'site.invalid_album_media' });
      expect(repository.saveDraft).not.toHaveBeenCalled();
    });

    it('does not publish a draft whose album lost a photo (RF03)', async () => {
      repository.find.mockResolvedValue({ ...published(null), draft: postWedding([OTHER]) });

      await expect(service.publish('wedding-a')).rejects.toBeInstanceOf(SiteInvalidAlbumMedia);
      expect(repository.publish).not.toHaveBeenCalled();
    });

    it('keeps album, thanks and the album-only photos out of the public site until the date (RF04)', async () => {
      clock.now.mockReturnValue(AT_WEDDING);
      repository.find.mockResolvedValue(published(postWedding([ALBUM_1, GALLERY])));

      const site = await service.getPublic('wedding-a');

      expect(types(site.config)).not.toContain('album');
      expect(types(site.config)).not.toContain('thanks');
      expect(Object.keys(site.media).sort()).toEqual([COVER, GALLERY].sort());
    });

    it('serves the published album with its photos in order once the date passed (RF05)', async () => {
      repository.find.mockResolvedValue(published(postWedding([ALBUM_2, ALBUM_1])));

      const site = await service.getPublic('wedding-a');

      const album = site.config.sections.find((section) => section.type === 'album');
      expect(album).toMatchObject({ enabled: true, content: { mediaIds: [ALBUM_2, ALBUM_1] } });
      expect(types(site.config)).toContain('thanks');
      expect(site.media[ALBUM_2]).toBeDefined();
    });

    it('migrates a version 1 document by adding both sections disabled at the end', async () => {
      const legacy = initialSiteConfig() as unknown as { version: number; sections: unknown[] };
      legacy.version = 1;
      legacy.sections = legacy.sections.slice(0, 12);
      repository.find.mockResolvedValue({ ...published(null), draft: legacy });

      const site = await service.getForPanel('wedding-a');

      expect(site.draft.version).toBe(2);
      expect(site.draft.sections.slice(-2)).toEqual([
        { type: 'album', enabled: false, content: { heading: '', mediaIds: [] } },
        { type: 'thanks', enabled: false, content: { heading: '', text: '' } },
      ]);
    });

    it('counts an album photo as in use for the media checker (PRD RF11a)', async () => {
      service.onModuleInit();
      const [[checker]] = media.registerUsageChecker.mock.calls as [[MediaUsageChecker]];
      repository.find.mockResolvedValue({ ...published(null), draft: postWedding([ALBUM_1]) });

      await expect(checker.isInUse('wedding-a', ALBUM_1)).resolves.toBe(true);
    });
  });

  describe('isPublishedSectionEnabled (spec 013 ADR-002)', () => {
    const withGuestbook = (enabled: boolean): SiteConfig => {
      const config = initialSiteConfig();
      config.sections = config.sections.map((section) =>
        section.type === 'guestbook' ? { ...section, enabled } : section,
      );
      return config;
    };
    const row = (draft: SiteConfig, published: SiteConfig | null) => ({
      draft,
      published,
      publishedAt: published ? UPDATED_AT : null,
      updatedAt: UPDATED_AT,
    });

    it('reads the published version, not the draft', async () => {
      repository.find.mockResolvedValue(row(withGuestbook(false), withGuestbook(true)));
      await expect(service.isPublishedSectionEnabled('wedding-a', 'guestbook')).resolves.toBe(true);

      repository.find.mockResolvedValue(row(withGuestbook(true), withGuestbook(false)));
      await expect(service.isPublishedSectionEnabled('wedding-a', 'guestbook')).resolves.toBe(
        false,
      );
      expect(repository.find).toHaveBeenCalledWith('wedding-a');
    });

    it('says no without a published version', async () => {
      repository.find.mockResolvedValue(row(withGuestbook(true), null));
      await expect(service.isPublishedSectionEnabled('wedding-a', 'guestbook')).resolves.toBe(
        false,
      );

      repository.find.mockResolvedValue(null);
      await expect(service.isPublishedSectionEnabled('wedding-a', 'guestbook')).resolves.toBe(
        false,
      );
    });
  });

  describe('media usage checker', () => {
    let checker: MediaUsageChecker;

    beforeEach(() => {
      service.onModuleInit();
      [[checker]] = media.registerUsageChecker.mock.calls;
    });

    it('registers itself as "site" in the MediaService', () => {
      expect(checker.place).toBe('site');
    });

    it('counts an image only in the published version as in use, and not one outside both', async () => {
      const gallery = initialSiteConfig();
      gallery.sections = gallery.sections.map((section) =>
        section.type === 'gallery' ? { ...section, content: { mediaIds: [GALLERY] } } : section,
      );
      repository.find.mockResolvedValue({
        draft: withCover(initialSiteConfig(), COVER),
        published: gallery,
        publishedAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      });

      await expect(checker.isInUse('wedding-a', GALLERY)).resolves.toBe(true);
      await expect(checker.isInUse('wedding-a', COVER)).resolves.toBe(true);
      await expect(checker.isInUse('wedding-a', OTHER)).resolves.toBe(false);
      expect(repository.find).toHaveBeenCalledWith('wedding-a');
    });

    it('says no when the wedding has no site document', async () => {
      repository.find.mockResolvedValue(null);

      await expect(checker.isInUse('wedding-a', COVER)).resolves.toBe(false);
    });
  });
});
