import type { SiteConfig } from './site-config.schema';

/** Todos os mediaId do documento: capa e imagens das seções, álbum incluído (spec 007 RF14, 014). */
export function collectMediaIds(config: SiteConfig): string[] {
  const ids: string[] = [];
  if (config.theme.coverMediaId) ids.push(config.theme.coverMediaId);
  for (const section of config.sections) {
    switch (section.type) {
      case 'story':
      case 'gallery':
      case 'album':
        ids.push(...section.content.mediaIds);
        break;
      case 'weddingParty':
        for (const person of section.content.people) if (person.mediaId) ids.push(person.mediaId);
        break;
    }
  }
  return [...new Set(ids)];
}

/** Fotos do álbum, conferidas em lote ao salvar e publicar (spec 014 RF03). */
export const albumMediaIds = (config: SiteConfig): string[] =>
  config.sections.flatMap((section) => (section.type === 'album' ? section.content.mediaIds : []));
