import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { WeddingRole } from '../../generated/prisma/enums';

// Contexto do casamento resolvido por um guard; o weddingId nunca vem do corpo nem da query.
export interface TenantContext {
  weddingId: string;
  /** Papel no painel; ausente nas rotas públicas do site. */
  role?: WeddingRole;
}

/** Usuário da sessão, preenchido pela autenticação (spec 004). */
export interface RequestUser {
  id: string;
  isSuperadmin: boolean;
}

export interface TenantRequest extends Request {
  user?: RequestUser;
  tenant?: TenantContext;
}

/** Lê o contexto gravado pelo guard; o controller passa o weddingId adiante. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined =>
    ctx.switchToHttp().getRequest<TenantRequest>().tenant,
);
