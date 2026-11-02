import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MediaUrlsSchema = z
  // URLs absolutas; em desenvolvimento podem ser caminhos da própria origem (S3_PUBLIC_BASE_URL).
  .object({ sm: z.string(), md: z.string(), lg: z.string(), og: z.string() })
  .meta({ id: 'MediaUrls' });

/** Mídia resolvida pelos outros módulos (mapa mediaId → mídia do site, presentes e álbum). */
export const MediaViewSchema = z
  .object({
    id: z.uuid(),
    /** Do original, com a orientação aplicada; cada WebP tem largura min(máxima, width). */
    width: z.int(),
    height: z.int(),
    urls: MediaUrlsSchema,
  })
  .meta({ id: 'MediaView' });

export const MediaSchema = z.object({
  id: z.uuid(),
  width: z.int(),
  height: z.int(),
  createdAt: z.iso.datetime(),
  urls: MediaUrlsSchema,
});

export class MediaDto extends createZodDto(MediaSchema) {}

export const MediaPageSchema = z.object({
  items: z.array(MediaSchema),
  nextCursor: z.uuid().nullable(),
});

export class MediaPageDto extends createZodDto(MediaPageSchema) {}

export const ListMediaQuerySchema = z.object({ cursor: z.uuid().optional() });

export class ListMediaQueryDto extends createZodDto(ListMediaQuerySchema) {}
