import { SetMetadata } from '@nestjs/common';
import type { WeddingRole } from '../../generated/prisma/enums';

export const ACCESS_KEY = 'casaria:access';
export const PANEL_ORIGIN_KEY = 'casaria:panel-origin';
export const TERMS_EXEMPT_KEY = 'casaria:terms-exempt';

export type AccessDeclaration =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'roles'; roles: WeddingRole[] }
  | { kind: 'superadmin' };

// Declaração de acesso de cada rota (spec 004). Sem declaração: rota de casamento exige owner,
// e qualquer outra é negada.

/** Sem sessão: site, webhooks, login, Google e redefinição de senha. */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessDeclaration);

/** Só sessão válida: /auth/me, logout e troca de senha. */
export const Authenticated = () =>
  SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessDeclaration);

/** Papel no casamento da rota /v1/weddings/:weddingId. */
export const Roles = (...roles: WeddingRole[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'roles', roles } satisfies AccessDeclaration);

/** Só quem tem is_superadmin (módulo admin). */
export const SuperadminOnly = () =>
  SetMetadata(ACCESS_KEY, { kind: 'superadmin' } satisfies AccessDeclaration);

/** Exige o Origin do painel também numa rota pública que altera estado (ex.: aceite de convite). */
export const PanelOriginOnly = () => SetMetadata(PANEL_ORIGIN_KEY, true);

/** Rota autenticada aberta antes do aceite dos termos: só /auth/me, logout e o aceite (spec 015). */
export const TermsExempt = () => SetMetadata(TERMS_EXEMPT_KEY, true);
