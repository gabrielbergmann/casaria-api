import { MediaFileRequired } from './errors/media-file-required';
import { MediaController } from './media.controller';
import type { MediaService } from './media.service';

describe('MediaController', () => {
  const media = { upload: jest.fn() };
  const controller = new MediaController(media as unknown as MediaService);
  const tenant = { weddingId: 'wedding-a', role: 'editor' as const };

  beforeEach(() => jest.resetAllMocks());

  it('answers media.file_required without a file', async () => {
    await expect(controller.upload(tenant, undefined)).rejects.toBeInstanceOf(MediaFileRequired);
    await expect(controller.upload(tenant, { buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(
      MediaFileRequired,
    );
    expect(media.upload).not.toHaveBeenCalled();
  });

  it('passes only the content and the weddingId of the guard to the service', async () => {
    const createdAt = new Date('2026-10-25T12:00:00Z');
    media.upload.mockResolvedValue({ id: 'media-1', width: 1, height: 1, createdAt, urls: {} });
    const file = { buffer: Buffer.from('x'), originalname: '../outro/x.jpg' };

    const result = await controller.upload(tenant, file);

    expect(media.upload).toHaveBeenCalledWith('wedding-a', file.buffer);
    expect(result.createdAt).toBe('2026-10-25T12:00:00.000Z');
  });
});
