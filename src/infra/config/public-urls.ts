import type { Env } from './env.schema';

type UrlEnv = Pick<Env, 'NODE_ENV' | 'APP_DOMAIN'> & Partial<Pick<Env, 'DEV_PANEL_URL'>>;

// Porta padrão do Vite: em desenvolvimento o painel roda nele e o Vite repassa /v1 à API,
// então painel e API ficam na mesma origem e o cookie de sessão funciona sem DNS.
const DEV_PANEL_PORT = 5173;

/** Endereço público do painel em desenvolvimento (túnel https), se configurado. */
const devPanelUrl = (env: UrlEnv) =>
  env.NODE_ENV === 'development' && env.DEV_PANEL_URL ? env.DEV_PANEL_URL : undefined;

/**
 * Origem do painel: https://app.<dominio> (em desenvolvimento, http://app.<dominio>:5173, ou o
 * DEV_PANEL_URL quando o painel é aberto por um túnel https para o OAuth funcionar).
 */
export function panelOrigin(env: UrlEnv): string {
  const tunnel = devPanelUrl(env);
  if (tunnel) return tunnel;
  return env.NODE_ENV === 'development'
    ? `http://app.${env.APP_DOMAIN}:${DEV_PANEL_PORT}`
    : `https://app.${env.APP_DOMAIN}`;
}

/** Site do casamento: https://<slug>.<dominio> (em desenvolvimento, no Vite, como o painel). */
export function siteOrigin(env: UrlEnv, slug: string): string {
  return env.NODE_ENV === 'development'
    ? `http://${slug}.${env.APP_DOMAIN}:${DEV_PANEL_PORT}`
    : `https://${slug}.${env.APP_DOMAIN}`;
}

/** Origem pública da API, usada no retorno do Google. */
export function apiOrigin(env: UrlEnv): string {
  return env.NODE_ENV === 'development' ? panelOrigin(env) : `https://api.${env.APP_DOMAIN}`;
}

/** Origin do painel nas rotas que alteram estado (ADR-005); em desenvolvimento, qualquer porta. */
export function isPanelOrigin(origin: string | undefined, env: UrlEnv): boolean {
  if (!origin) return false;
  if (env.NODE_ENV !== 'development') return origin === panelOrigin(env);
  if (origin === devPanelUrl(env)) return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === `app.${env.APP_DOMAIN}`;
  } catch {
    return false;
  }
}
