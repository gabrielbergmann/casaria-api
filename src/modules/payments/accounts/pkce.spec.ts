import { createHash } from 'node:crypto';
import { createPkcePair, newOAuthState, weddingIdOfState } from './pkce';

const WEDDING = '01890000-0000-7000-8000-00000000000a';

describe('pkce', () => {
  it('derives the S256 challenge from a 43-character verifier', () => {
    const { codeVerifier, codeChallenge } = createPkcePair();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(createHash('sha256').update(codeVerifier).digest('base64url'));
  });

  it('makes a new state each time and keeps the wedding to return to', () => {
    const state = newOAuthState(WEDDING);

    expect(state).not.toBe(newOAuthState(WEDDING));
    expect(weddingIdOfState(state)).toBe(WEDDING);
    expect(weddingIdOfState('forjado')).toBeNull();
    expect(weddingIdOfState(undefined)).toBeNull();
  });
});
