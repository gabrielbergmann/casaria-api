import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Par PKCE S256 (RFC 7636): verifier de 43 caracteres base64url e o challenge = SHA-256 dele. */
export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * state = "<weddingId>.<aleatório>": de uso único na sessão; o casamento no começo só diz para
 * onde voltar quando o state é recusado (o Mercado Pago pede um state sem dado sensível).
 */
export const newOAuthState = (weddingId: string) =>
  `${weddingId}.${randomBytes(32).toString('base64url')}`;

export function weddingIdOfState(state: string | undefined): string | null {
  const weddingId = state?.split('.')[0] ?? '';
  return z.uuid().safeParse(weddingId).success ? weddingId : null;
}
