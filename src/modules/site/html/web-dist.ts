import { readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { hasMetaBlock } from './site-meta';

// Sem WEB_DIST_DIR (desenvolvimento e testes): HTML mínimo com o mesmo bloco de meta.
export const FALLBACK_TEMPLATE =
  '<!doctype html>\n<html lang="pt-BR">\n  <head>\n    <meta charset="UTF-8" />\n' +
  '    <!--site-meta--><title>CasarIA</title><!--/site-meta-->\n  </head>\n' +
  '  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';

/** Lê o index.html uma vez, no boot; sem o bloco de meta, a API não sobe. */
export function loadTemplate(distDir: string | undefined): string {
  if (!distDir) return FALLBACK_TEMPLATE;
  const template = readFileSync(resolve(distDir, 'index.html'), 'utf8');
  if (!hasMetaBlock(template)) {
    throw new Error('WEB_DIST_DIR/index.html sem o bloco <!--site-meta--> do web');
  }
  return template;
}

/**
 * Caminho relativo do arquivo do build para o caminho da URL, preso ao WEB_DIST_DIR (RNF02). O
 * index.html nunca sai cru: ele só é servido com as meta.
 */
export function resolveStaticFile(distDir: string, urlPath: string): string | null {
  let relative: string;
  try {
    relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!relative || relative === 'index.html' || relative.includes('\0')) return null;
  const root = resolve(distDir);
  const file = resolve(root, relative);
  if (!file.startsWith(root + sep)) return null;
  try {
    return statSync(file).isFile() ? relative : null;
  } catch {
    return null;
  }
}
