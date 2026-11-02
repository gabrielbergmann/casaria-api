import type { RequestUser } from '../tenant/tenant-context';

/** Usuário recarregado do banco a cada requisição com sessão (nunca guardado na sessão). */
export interface SessionUser extends RequestUser {
  email: string;
  name: string;
  sessionVersion: number;
  /** Última versão dos termos aceita (spec 015); nula antes do primeiro aceite. */
  termsAcceptedVersion: string | null;
}
