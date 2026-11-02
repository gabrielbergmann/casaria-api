import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
import { DomainError } from '../../common/errors/domain-error';
import { MediaInvalidImage } from './errors/media-invalid-image';
import { MediaUnsupportedType } from './errors/media-unsupported-type';
import { detectImageFormat, type ImageFormat } from './image-format';
import type { VariantName } from './media-keys';

/** Largura máxima de cada WebP (spec 006 RF04); nenhuma é ampliada. */
export const WEBP_WIDTHS = { sm: 640, md: 1280, lg: 1920 } as const;
export const OG_SIZE = { width: 1200, height: 630 } as const;

// Limite padrão de pixels do sharp (RNF02), aplicado também ao HEIC antes de decodificar.
const PIXEL_LIMIT = 0x3fff * 0x3fff;
const QUALITY = 80;

export interface ImageVariant {
  name: VariantName;
  body: Buffer;
  contentType: 'image/webp' | 'image/jpeg';
}

export interface ProcessedImage {
  format: ImageFormat;
  /** Dimensões do original com a orientação aplicada. */
  width: number;
  height: number;
  variants: ImageVariant[];
}

interface OpenedImage {
  /** Um pipeline novo a cada versão, já com a orientação aplicada. */
  open: () => Sharp;
  width: number;
  height: number;
}

/** HEIC pelo heic-decode (ADR-001); a orientação do HEIF já sai aplicada pelo libheif. */
async function openHeic(original: Buffer): Promise<OpenedImage> {
  const images = await decodeHeic.all({ buffer: original });
  try {
    const [primary] = images;
    if (!primary || primary.width * primary.height > PIXEL_LIMIT) throw new MediaInvalidImage();
    const { width, height, data } = await primary.decode();
    const pixels = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return { open: () => sharp(pixels, { raw: { width, height, channels: 4 } }), width, height };
  } finally {
    images.dispose();
  }
}

async function openWithSharp(original: Buffer): Promise<OpenedImage> {
  const { width, height, orientation } = await sharp(original).metadata();
  // Orientações EXIF 5 a 8 giram 90°: largura e altura trocam.
  const turned = (orientation ?? 1) >= 5;
  return {
    open: () => sharp(original).rotate(),
    width: turned ? height : width,
    height: turned ? width : height,
  };
}

const webp = (image: OpenedImage, name: keyof typeof WEBP_WIDTHS) =>
  image
    .open()
    .resize({ width: WEBP_WIDTHS[name], withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

const og = (image: OpenedImage) =>
  image
    .open()
    .resize(OG_SIZE.width, OG_SIZE.height, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: QUALITY })
    .toBuffer();

/**
 * Valida o formato pelo conteúdo e gera, em memória, as três WebP e a JPEG do og:image (spec 006
 * RF02 a RF05). O sharp não copia metadados para a saída, então EXIF e GPS ficam de fora.
 */
export async function processImage(original: Buffer): Promise<ProcessedImage> {
  const format = detectImageFormat(original);
  if (!format) throw new MediaUnsupportedType();
  try {
    const image = format === 'heic' ? await openHeic(original) : await openWithSharp(original);
    const [sm, md, lg, ogImage] = await Promise.all([
      webp(image, 'sm'),
      webp(image, 'md'),
      webp(image, 'lg'),
      og(image),
    ]);
    return {
      format,
      width: image.width,
      height: image.height,
      variants: [
        { name: 'sm', body: sm, contentType: 'image/webp' },
        { name: 'md', body: md, contentType: 'image/webp' },
        { name: 'lg', body: lg, contentType: 'image/webp' },
        { name: 'og', body: ogImage, contentType: 'image/jpeg' },
      ],
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new MediaInvalidImage();
  }
}
