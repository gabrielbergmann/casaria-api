import type { SiteConfig, SiteSection } from './site-config.schema';

const POST_WEDDING_DEFAULTS: SiteSection[] = [
  { type: 'album', enabled: false, content: { heading: '', mediaIds: [] } },
  { type: 'thanks', enabled: false, content: { heading: '', text: '' } },
];

const isVersion1 = (doc: unknown): doc is { version: 1; sections: SiteSection[] } =>
  typeof doc === 'object' &&
  doc !== null &&
  (doc as { version?: unknown }).version === 1 &&
  Array.isArray((doc as { sections?: unknown }).sections);

/**
 * Documento da versão 1 (spec 007) ganha álbum e agradecimento desativados no fim e vira a 2
 * (spec 014). Os demais seguem como estão, para o schema validar.
 */
export function upgradeSiteConfig<T>(doc: T): T | SiteConfig {
  if (!isVersion1(doc)) return doc;
  return {
    ...(doc as unknown as SiteConfig),
    version: 2,
    sections: [...doc.sections, ...structuredClone(POST_WEDDING_DEFAULTS)],
  };
}

/** Cópia para o site antes da data: sem as seções pós-casamento (spec 014 ADR-002). */
export const withoutSections = (config: SiteConfig, types: readonly string[]): SiteConfig => ({
  ...config,
  sections: config.sections.filter((section) => !types.includes(section.type)),
});
