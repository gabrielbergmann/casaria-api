import type { SitePageMeta } from '../site.service';

// Bloco do casaria-web/index.html trocado pela API (skill site-e-tema §8). Fora dele, nada muda.
const META_BLOCK = /<!--site-meta-->[\s\S]*?<!--\/site-meta-->/;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Todo valor vem do casal: escapado sempre, em texto e em atributo. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

export const hasMetaBlock = (template: string) => META_BLOCK.test(template);

export function renderMeta(meta: SitePageMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    ...(meta.ogImage ? [`<meta property="og:image" content="${escapeHtml(meta.ogImage)}">`] : []),
  ].join('\n    ');
}

export const injectMeta = (template: string, meta: SitePageMeta) =>
  template.replace(META_BLOCK, () => renderMeta(meta));
