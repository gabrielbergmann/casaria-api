export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif';

export const CONTENT_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  avif: 'image/avif',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);

const ascii = (buffer: Buffer, start: number, end: number) =>
  buffer.subarray(start, end).toString('latin1');

/** Marcas da caixa ftyp do ISO BMFF: a principal e as compatíveis. */
function ftypBrands(buffer: Buffer): string[] {
  if (buffer.length < 16 || ascii(buffer, 4, 8) !== 'ftyp') return [];
  const boxEnd = Math.min(buffer.readUInt32BE(0), buffer.length);
  const brands = [ascii(buffer, 8, 12)];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(ascii(buffer, offset, offset + 4));
  }
  return brands;
}

/**
 * Formato pela assinatura dos primeiros bytes (spec 006 RF02), nunca pela extensão nem pelo
 * Content-Type. SVG, HTML, GIF e qualquer outro conteúdo devolvem null.
 */
export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
    return 'webp';
  }
  const brands = ftypBrands(buffer);
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'avif';
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return 'heic';
  return null;
}
