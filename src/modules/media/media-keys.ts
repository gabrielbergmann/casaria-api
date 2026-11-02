// Chaves no storage (spec 006): nascem só do weddingId do guard e do mediaId do banco, nunca do
// nome do arquivo enviado.

export const VARIANT_FILES = { sm: 'sm.webp', md: 'md.webp', lg: 'lg.webp', og: 'og.jpg' } as const;

export type VariantName = keyof typeof VARIANT_FILES;

export const VARIANT_NAMES = Object.keys(VARIANT_FILES) as VariantName[];

export const weddingPrefix = (weddingId: string) => `weddings/${weddingId}/`;

export const mediaPrefix = (weddingId: string, mediaId: string) =>
  `${weddingPrefix(weddingId)}media/${mediaId}/`;

export const originalKey = (weddingId: string, mediaId: string) =>
  `${mediaPrefix(weddingId, mediaId)}original`;

export const variantKey = (weddingId: string, mediaId: string, variant: VariantName) =>
  `${mediaPrefix(weddingId, mediaId)}${VARIANT_FILES[variant]}`;
