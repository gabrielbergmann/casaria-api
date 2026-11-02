import { SITE_CONFIG_VERSION, type SiteConfig, type SiteSection } from './site-config.schema';
import { DEFAULT_FONTS, PALETTES } from './theme-options';

const EMPTY_SECTIONS: SiteSection[] = [
  { type: 'hero', enabled: true, content: {} },
  { type: 'story', enabled: true, content: { text: '', mediaIds: [] } },
  { type: 'ceremony', enabled: true, content: { ceremony: null, party: null } },
  { type: 'dressCode', enabled: true, content: { text: '' } },
  { type: 'weddingParty', enabled: true, content: { people: [] } },
  { type: 'lodging', enabled: true, content: { items: [] } },
  { type: 'gallery', enabled: true, content: { mediaIds: [] } },
  { type: 'faq', enabled: true, content: { items: [] } },
  { type: 'music', enabled: true, content: { songs: [] } },
  { type: 'guestbook', enabled: true, content: {} },
  { type: 'gifts', enabled: true, content: {} },
  { type: 'rsvp', enabled: true, content: {} },
  // Pós-casamento (spec 014): desativadas até o casal montar.
  { type: 'album', enabled: false, content: { heading: '', mediaIds: [] } },
  { type: 'thanks', enabled: false, content: { heading: '', text: '' } },
];

/**
 * Documento inicial (spec 007 RF06): primeira paleta, Playfair Display e Lato, sem capa e as
 * seções do PRD ativas, na ordem; álbum e agradecimento (spec 014) entram desativados no fim.
 * Nome do casal e data vêm do cadastro, não daqui.
 */
export function initialSiteConfig(): SiteConfig {
  return {
    version: SITE_CONFIG_VERSION,
    theme: { colors: { ...PALETTES[0].colors }, fonts: { ...DEFAULT_FONTS }, coverMediaId: null },
    sections: structuredClone(EMPTY_SECTIONS),
  };
}
