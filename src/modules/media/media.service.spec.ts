import type { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { FakeObjectStorage } from '../../common/testing/fake-object-storage';
import { MediaInUse } from './errors/media-in-use';
import { MediaNotFound } from './errors/media-not-found';
import { MediaStorageUnavailable } from './errors/media-storage-unavailable';
import { MediaUnsupportedType } from './errors/media-unsupported-type';
import type { MediaRepository } from './media.repository';
import { MediaService } from './media.service';

const WEDDING_A = '0199f1a0-0000-7000-8000-00000000000a';
const WEDDING_B = '0199f1a0-0000-7000-8000-00000000000b';
const MEDIA_A = '0199f1a1-0000-7000-8000-0000000000a1';
const MEDIA_B = '0199f1a1-0000-7000-8000-0000000000b1';
const CREATED_AT = new Date('2026-10-25T12:00:00Z');

describe('MediaService', () => {
  const repository = {
    create: jest.fn(),
    exists: jest.fn(),
    listPage: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  };
  const logger = { info: jest.fn(), error: jest.fn() };
  let storage: FakeObjectStorage;
  let service: MediaService;
  let photo: Buffer;

  beforeAll(async () => {
    photo = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#a05030' } })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    storage = new FakeObjectStorage();
    service = new MediaService(
      repository as unknown as MediaRepository,
      storage,
      logger as unknown as PinoLogger,
    );
    repository.create.mockResolvedValue({
      id: MEDIA_A,
      width: 80,
      height: 60,
      createdAt: CREATED_AT,
    });
  });

  const prefixA = `weddings/${WEDDING_A}/media/${MEDIA_A}/`;

  describe('upload', () => {
    it('stores the original and the four versions under the wedding of the guard', async () => {
      const media = await service.upload(WEDDING_A, photo);

      expect(repository.create).toHaveBeenCalledWith(WEDDING_A, {
        contentType: 'image/jpeg',
        byteSize: photo.length,
        width: 80,
        height: 60,
      });
      expect(storage.keys()).toEqual(
        ['lg.webp', 'md.webp', 'og.jpg', 'original', 'sm.webp'].map((file) => prefixA + file),
      );
      expect(media).toEqual({
        id: MEDIA_A,
        width: 80,
        height: 60,
        createdAt: CREATED_AT,
        urls: {
          sm: `https://storage.test/${prefixA}sm.webp`,
          md: `https://storage.test/${prefixA}md.webp`,
          lg: `https://storage.test/${prefixA}lg.webp`,
          og: `https://storage.test/${prefixA}og.jpg`,
        },
      });
    });

    it('keeps the original private and caches the versions for a year', async () => {
      await service.upload(WEDDING_A, photo);

      const original = storage.objects.get(`${prefixA}original`);
      expect(original.contentType).toBe('image/jpeg');
      expect(original.cacheControl).toBeUndefined();
      expect(storage.objects.get(`${prefixA}sm.webp`)).toMatchObject({
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      expect(storage.objects.get(`${prefixA}og.jpg`)?.contentType).toBe('image/jpeg');
    });

    it('builds every key from the weddingId and the mediaId, never from the file name', async () => {
      // O nome "../outro/x.jpg" nem chega ao service: só o conteúdo é repassado.
      await service.upload(WEDDING_A, photo);

      for (const key of storage.keys()) expect(key.startsWith(prefixA)).toBe(true);
    });

    it('undoes everything and answers 503 when the third write fails', async () => {
      storage.failOnPut = 3;

      await expect(service.upload(WEDDING_A, photo)).rejects.toBeInstanceOf(
        MediaStorageUnavailable,
      );
      expect(storage.keys()).toEqual([]);
      expect(repository.delete).toHaveBeenCalledWith(WEDDING_A, MEDIA_A);
    });

    it('writes nothing for an unsupported file', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

      await expect(service.upload(WEDDING_A, svg)).rejects.toBeInstanceOf(MediaUnsupportedType);
      expect(repository.create).not.toHaveBeenCalled();
      expect(storage.keys()).toEqual([]);
    });
  });

  describe('list', () => {
    const record = (n: number) => ({
      id: `0199f1a1-0000-7000-8000-${String(n).padStart(12, '0')}`,
      width: 10,
      height: 10,
      createdAt: CREATED_AT,
    });

    it('returns a page with nextCursor when there are more items', async () => {
      repository.listPage.mockResolvedValue(Array.from({ length: 51 }, (_, i) => record(100 - i)));

      const page = await service.list(WEDDING_A, undefined);

      expect(repository.listPage).toHaveBeenCalledWith(WEDDING_A, undefined, 50);
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBe(page.items[49].id);
    });

    it('returns no cursor on the last page', async () => {
      repository.listPage.mockResolvedValue([record(2), record(1)]);

      const page = await service.list(WEDDING_A, MEDIA_A);

      expect(repository.listPage).toHaveBeenCalledWith(WEDDING_A, MEDIA_A, 50);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0].urls.sm).toContain(`weddings/${WEDDING_A}/media/`);
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await service.upload(WEDDING_A, photo);
      repository.exists.mockImplementation(
        async (weddingId: string, mediaId: string) =>
          weddingId === WEDDING_A && mediaId === MEDIA_A,
      );
    });

    it('removes the five objects and the record of an unused image', async () => {
      service.registerUsageChecker({ place: 'site', isInUse: async () => false });

      await service.delete(WEDDING_A, MEDIA_A);

      expect(storage.keys()).toEqual([]);
      expect(repository.delete).toHaveBeenCalledWith(WEDDING_A, MEDIA_A);
    });

    it('refuses an image in use and says where, deleting nothing', async () => {
      const isInUse = jest.fn().mockResolvedValue(true);
      service.registerUsageChecker({ place: 'site', isInUse });
      service.registerUsageChecker({ place: 'gifts', isInUse: async () => false });

      const error = await service.delete(WEDDING_A, MEDIA_A).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(MediaInUse);
      expect((error as MediaInUse).usedIn).toEqual(['site']);
      expect(isInUse).toHaveBeenCalledWith(WEDDING_A, MEDIA_A);
      expect(storage.keys()).toHaveLength(5);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('answers 404 when wedding B deletes an image of wedding A, leaving it intact', async () => {
      await expect(service.delete(WEDDING_B, MEDIA_A)).rejects.toBeInstanceOf(MediaNotFound);

      expect(repository.exists).toHaveBeenCalledWith(WEDDING_B, MEDIA_A);
      expect(storage.keys()).toHaveLength(5);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for a malformed id without querying the database', async () => {
      await expect(service.delete(WEDDING_A, '../x')).rejects.toBeInstanceOf(MediaNotFound);

      expect(repository.exists).not.toHaveBeenCalled();
    });

    it('keeps the record when the storage fails, so the couple can retry', async () => {
      storage.failOnDelete = true;

      await expect(service.delete(WEDDING_A, MEDIA_A)).rejects.toBeInstanceOf(
        MediaStorageUnavailable,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('returns only the images of the wedding, with a single query', async () => {
      repository.findMany.mockResolvedValue([
        { id: MEDIA_A, width: 80, height: 60, createdAt: CREATED_AT },
      ]);
      const missing = '0199f1a1-0000-7000-8000-0000000000ff';

      const resolved = await service.resolve(WEDDING_A, [MEDIA_A, MEDIA_B, missing, MEDIA_A]);

      expect(repository.findMany).toHaveBeenCalledTimes(1);
      expect(repository.findMany).toHaveBeenCalledWith(WEDDING_A, [MEDIA_A, MEDIA_B, missing]);
      expect(Object.keys(resolved)).toEqual([MEDIA_A]);
      expect(resolved[MEDIA_A]).toEqual({
        id: MEDIA_A,
        width: 80,
        height: 60,
        urls: expect.objectContaining({ og: `https://storage.test/${prefixA}og.jpg` }),
      });
    });

    it('ignores malformed ids and skips the query when nothing is left', async () => {
      await expect(service.resolve(WEDDING_A, ['not-a-uuid'])).resolves.toEqual({});

      expect(repository.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteWeddingFiles', () => {
    it('removes everything under wedding A and keeps wedding B', async () => {
      await service.upload(WEDDING_A, photo);
      repository.create.mockResolvedValue({
        id: MEDIA_B,
        width: 80,
        height: 60,
        createdAt: CREATED_AT,
      });
      await service.upload(WEDDING_B, photo);

      await service.deleteWeddingFiles(WEDDING_A);

      expect(storage.keys().some((key) => key.startsWith(`weddings/${WEDDING_A}/`))).toBe(false);
      expect(storage.keys()).toHaveLength(5);
      expect(storage.keys().every((key) => key.startsWith(`weddings/${WEDDING_B}/`))).toBe(true);
    });

    it('answers 503 when the storage fails, so the wedding stays in the database', async () => {
      storage.failOnDelete = true;

      await expect(service.deleteWeddingFiles(WEDDING_A)).rejects.toBeInstanceOf(
        MediaStorageUnavailable,
      );
    });
  });
});
