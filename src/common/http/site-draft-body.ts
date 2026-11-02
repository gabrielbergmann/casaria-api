import type { IncomingMessage } from 'node:http';

const SITE_DRAFT_PATH = /^\/v1\/weddings\/[^/]+\/site\/draft\/?$/;

// O documento do site tem limite de domínio de 100 KB (spec 007 RF08), igual ao padrão do parser
// JSON do Express. Só nesta rota o parser aceita até 1 MB, para quem responde ser o service, com
// site.document_too_large; as demais rotas mantêm os 100 KB.
export const SITE_DRAFT_BODY_LIMIT = '1mb';

/** PUT JSON do rascunho do site, decidido antes do roteamento do Nest. */
export function isSiteDraftJson(req: IncomingMessage): boolean {
  const path = (req.url ?? '').split('?')[0];
  const contentType = req.headers['content-type'] ?? '';
  return req.method === 'PUT' && SITE_DRAFT_PATH.test(path) && contentType.includes('json');
}
