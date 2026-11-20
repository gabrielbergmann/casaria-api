import type { SiteConfig, SiteSection } from './site-config.schema';

const POST_WEDDING_DEFAULTS: SiteSection[] = [
  { type: 'album', enabled: false, content: { heading: '', mediaIds: [] } },
  { type: 'thanks', enabled: false, content: { heading: '', text: '' } },
];

const TIPS_DEFAULT: SiteSection = { type: 'tips', enabled: true, content: { items: [] } };

type VersionedDoc = { version: number; sections: SiteSection[] };

const isVersion = (doc: unknown, version: number): doc is VersionedDoc =>
  typeof doc === 'object' &&
  doc !== null &&
  (doc as { version?: unknown }).version === version &&
  Array.isArray((doc as { sections?: unknown }).sections);

/** Dicas vazia e ativa logo depois da hospedagem; vazia, ela não aparece no site (spec 019 RF02). */
function withTipsAfterLodging(sections: SiteSection[]): SiteSection[] {
  if (sections.some((section) => section.type === 'tips')) return sections;
  const lodging = sections.findIndex((section) => section.type === 'lodging');
  const at = lodging === -1 ? sections.length : lodging + 1;
  return [...sections.slice(0, at), structuredClone(TIPS_DEFAULT), ...sections.slice(at)];
}

/**
 * Leva o documento antigo à versão atual, um passo por versão: a 1 (spec 007) ganha álbum e
 * agradecimento desativados no fim (spec 014), e a 2 ganha Dicas (spec 019). Os demais seguem
 * como estão, para o schema validar.
 */
export function upgradeSiteConfig<T>(doc: T): T | SiteConfig {
  let current: unknown = doc;
  if (isVersion(current, 1)) {
    current = {
      ...current,
      version: 2,
      sections: [...current.sections, ...structuredClone(POST_WEDDING_DEFAULTS)],
    };
  }
  if (isVersion(current, 2)) {
    current = { ...current, version: 3, sections: withTipsAfterLodging(current.sections) };
  }
  return current as T | SiteConfig;
}

/** Cópia para o site antes da data: sem as seções pós-casamento (spec 014 ADR-002). */
export const withoutSections = (config: SiteConfig, types: readonly string[]): SiteConfig => ({
  ...config,
  sections: config.sections.filter((section) => !types.includes(section.type)),
});
