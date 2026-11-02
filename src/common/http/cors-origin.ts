import type { Env } from '../../infra/config/env.schema';

// Um único rótulo antes do domínio: app.<dominio> ou <slug>.<dominio>.
const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isAllowedOrigin(origin: string, appDomain: string, nodeEnv: Env['NODE_ENV']) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const isDevelopment = nodeEnv === 'development';
  const protocolOk = url.protocol === 'https:' || (isDevelopment && url.protocol === 'http:');
  const portOk = isDevelopment || url.port === '';
  const suffix = `.${appDomain}`;
  if (!protocolOk || !portOk || !url.hostname.endsWith(suffix)) return false;
  return SUBDOMAIN_LABEL.test(url.hostname.slice(0, -suffix.length));
}

type OriginCallback = (err: Error | null, allow?: boolean) => void;

// Sem Origin (mesma origem ou fora do navegador), não há o que liberar.
export const buildCorsOrigin =
  (appDomain: string, nodeEnv: Env['NODE_ENV']) =>
  (origin: string | undefined, callback: OriginCallback) =>
    callback(null, origin === undefined || isAllowedOrigin(origin, appDomain, nodeEnv));
