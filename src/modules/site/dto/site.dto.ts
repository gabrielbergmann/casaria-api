import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MediaViewSchema } from '../../media/dto/media.dto';
import { PublicSiteConfigSchema, SiteConfigSchema } from '../site-config.schema';
import { FONT_FAMILIES } from '../theme-options';

/** Corpo do PUT do rascunho; validado no service para responder site.invalid_config (422). */
export class SiteConfigDto extends createZodDto(SiteConfigSchema) {}

const mediaMap = z.record(z.string(), MediaViewSchema);

export const PanelSiteSchema = z.object({
  draft: SiteConfigSchema,
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  coupleName: z.string(),
  weddingDate: z.iso.datetime(),
  media: mediaMap,
});

export class PanelSiteDto extends createZodDto(PanelSiteSchema) {}

export const PublishedSiteSchema = z.object({ publishedAt: z.iso.datetime() });

export class PublishedSiteDto extends createZodDto(PublishedSiteSchema) {}

export const PublicSiteSchema = z.object({
  coupleName: z.string(),
  weddingDate: z.iso.datetime(),
  config: PublicSiteConfigSchema,
  media: mediaMap,
});

export class PublicSiteDto extends createZodDto(PublicSiteSchema) {}

const hexColor = z.string();

export const ThemeOptionsSchema = z.object({
  fonts: z.array(z.enum(FONT_FAMILIES)),
  palettes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      colors: z.object({
        primary: hexColor,
        secondary: hexColor,
        background: hexColor,
        surface: hexColor,
        text: hexColor,
        accent: hexColor,
      }),
    }),
  ),
});

export class ThemeOptionsDto extends createZodDto(ThemeOptionsSchema) {}
