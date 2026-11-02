import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { OBJECT_STORAGE, type ObjectStorage } from '../../infra/s3/object-storage';
import { MediaInUse } from './errors/media-in-use';
import { MediaNotFound } from './errors/media-not-found';
import { MediaStorageUnavailable } from './errors/media-storage-unavailable';
import { CONTENT_TYPES } from './image-format';
import { processImage, type ProcessedImage } from './image-processing';
import {
  mediaPrefix,
  originalKey,
  VARIANT_NAMES,
  variantKey,
  type VariantName,
  weddingPrefix,
} from './media-keys';
import type { MediaUsageChecker } from './media-usage';
import { type MediaRecord, MediaRepository } from './media.repository';

const PUBLIC_CACHE = 'public, max-age=31536000, immutable';
const PAGE_SIZE = 50;
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Mídia pronta para uso: dimensões do original e URLs públicas das versões. */
export interface MediaView {
  id: string;
  width: number;
  height: number;
  urls: Record<VariantName, string>;
}

export interface MediaListItem extends MediaView {
  createdAt: Date;
}

/**
 * Imagens do casamento (spec 006). Exportado para site, gifts e álbum (URLs e verificadores de
 * uso) e para weddings (exclusão de todos os arquivos, token WEDDING_FILES).
 */
@Injectable()
export class MediaService {
  private readonly usageCheckers: MediaUsageChecker[] = [];

  constructor(
    private readonly repository: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @InjectPinoLogger(MediaService.name) private readonly logger: PinoLogger,
  ) {}

  registerUsageChecker(checker: MediaUsageChecker): void {
    this.usageCheckers.push(checker);
  }

  /** Valida, gera as versões, registra e grava os cinco objetos na mesma requisição (RF01). */
  async upload(weddingId: string, file: Buffer): Promise<MediaListItem> {
    const image = await processImage(file);
    const media = await this.repository.create(weddingId, {
      contentType: CONTENT_TYPES[image.format],
      byteSize: file.length,
      width: image.width,
      height: image.height,
    });
    try {
      await this.storeObjects(weddingId, media.id, file, image);
    } catch (err) {
      this.logger.error({ err, mediaId: media.id }, 'media_store_failed');
      await this.undoUpload(weddingId, media.id);
      throw new MediaStorageUnavailable();
    }
    this.logger.info({ mediaId: media.id }, 'media_uploaded');
    return { ...this.toView(weddingId, media), createdAt: media.createdAt };
  }

  async list(
    weddingId: string,
    cursor: string | undefined,
  ): Promise<{ items: MediaListItem[]; nextCursor: string | null }> {
    const page = await this.repository.listPage(weddingId, cursor, PAGE_SIZE);
    const items = page.slice(0, PAGE_SIZE).map((media) => ({
      ...this.toView(weddingId, media),
      createdAt: media.createdAt,
    }));
    const nextCursor = page.length > PAGE_SIZE ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /**
   * Recusa a exclusão de imagem em uso (RF09). O storage é apagado antes do registro: se falhar, o
   * registro fica e o casal pode tentar de novo.
   */
  async delete(weddingId: string, mediaId: string): Promise<void> {
    if (!isUuid(mediaId) || !(await this.repository.exists(weddingId, mediaId))) {
      throw new MediaNotFound();
    }
    const usedIn = await this.findUsage(weddingId, mediaId);
    if (usedIn.length > 0) throw new MediaInUse(usedIn);
    try {
      await this.storage.deletePrefix(mediaPrefix(weddingId, mediaId));
    } catch (err) {
      this.logger.error({ err, mediaId }, 'media_delete_failed');
      throw new MediaStorageUnavailable();
    }
    await this.repository.delete(weddingId, mediaId);
    this.logger.info({ mediaId }, 'media_deleted');
  }

  /**
   * Resolve ids do casamento em URLs numa única consulta (RF10). Id ausente do mapa é imagem
   * inexistente, excluída ou de outro casamento.
   */
  async resolve(weddingId: string, mediaIds: string[]): Promise<Record<string, MediaView>> {
    const ids = [...new Set(mediaIds)].filter(isUuid);
    if (ids.length === 0) return {};
    const found = await this.repository.findMany(weddingId, ids);
    return Object.fromEntries(found.map((media) => [media.id, this.toView(weddingId, media)]));
  }

  /** Apaga tudo sob weddings/{weddingId}/ (RF12), chamado pela exclusão do casamento. */
  async deleteWeddingFiles(weddingId: string): Promise<void> {
    try {
      await this.storage.deletePrefix(weddingPrefix(weddingId));
    } catch (err) {
      this.logger.error({ err }, 'wedding_files_delete_failed');
      throw new MediaStorageUnavailable();
    }
  }

  private async findUsage(weddingId: string, mediaId: string): Promise<string[]> {
    const results = await Promise.all(
      this.usageCheckers.map(async (checker) =>
        (await checker.isInUse(weddingId, mediaId)) ? checker.place : null,
      ),
    );
    return results.filter((place): place is string => place !== null);
  }

  /** Original privado, sem cache público; versões com cache longo (RNF03). */
  private async storeObjects(
    weddingId: string,
    mediaId: string,
    file: Buffer,
    image: ProcessedImage,
  ): Promise<void> {
    await this.storage.put({
      key: originalKey(weddingId, mediaId),
      body: file,
      contentType: CONTENT_TYPES[image.format],
    });
    for (const variant of image.variants) {
      await this.storage.put({
        key: variantKey(weddingId, mediaId, variant.name),
        body: variant.body,
        contentType: variant.contentType,
        cacheControl: PUBLIC_CACHE,
      });
    }
  }

  /** Desfaz o envio (RF06): objetos já gravados e o registro. */
  private async undoUpload(weddingId: string, mediaId: string): Promise<void> {
    await this.storage
      .deletePrefix(mediaPrefix(weddingId, mediaId))
      .catch((err: unknown) => this.logger.error({ err, mediaId }, 'media_cleanup_failed'));
    await this.repository.delete(weddingId, mediaId);
  }

  private toView(weddingId: string, media: MediaRecord): MediaView {
    const urls = Object.fromEntries(
      VARIANT_NAMES.map((name) => [
        name,
        this.storage.publicUrl(variantKey(weddingId, media.id, name)),
      ]),
    ) as Record<VariantName, string>;
    return { id: media.id, width: media.width, height: media.height, urls };
  }
}
