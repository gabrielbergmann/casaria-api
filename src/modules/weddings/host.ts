import { isValidSlug } from './slug';

export type HostKind =
  | { kind: 'panel' }
  | { kind: 'api' }
  | { kind: 'root' }
  | { kind: 'site'; slug: string }
  | { kind: 'unknown' };

// Classifica o Host sem consultar o banco (spec 003, tabela de hosts e RNF02).
// Ignora maiúsculas e a porta.
export function classifyHost(host: string, appDomain: string): HostKind {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, '');
  if (hostname === appDomain || hostname === `www.${appDomain}`) return { kind: 'root' };
  if (!hostname.endsWith(`.${appDomain}`)) return { kind: 'unknown' };
  const subdomain = hostname.slice(0, -(appDomain.length + 1));
  if (subdomain === 'app') return { kind: 'panel' };
  if (subdomain === 'api') return { kind: 'api' };
  return isValidSlug(subdomain) ? { kind: 'site', slug: subdomain } : { kind: 'unknown' };
}
