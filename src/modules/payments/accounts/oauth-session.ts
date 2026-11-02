/** Conexão OAuth em andamento, guardada na sessão do usuário (no Redis): 10 minutos, uso único. */
export interface PendingOAuth {
  state: string;
  codeVerifier: string;
  weddingId: string;
  userId: string;
  issuedAt: number;
}

declare module 'express-session' {
  interface SessionData {
    mpOAuth?: PendingOAuth;
  }
}

/** O pedaço da sessão que a conexão usa (req.session nas rotas). */
export interface OAuthSession {
  mpOAuth?: PendingOAuth;
}
