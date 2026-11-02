import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenRole } from '../../modules/auth/errors/forbidden-role';
import { TermsAcceptanceRequired } from '../../modules/auth/errors/terms-acceptance-required';
import { SessionService } from '../../modules/auth/session.service';
import { isPanelWeddingRoute } from '../tenant/panel-route';
import { TERMS_VERSION } from '../personal-data/terms';
import { ACCESS_KEY, type AccessDeclaration, TERMS_EXEMPT_KEY } from './access.decorators';

/**
 * Guard global de acesso (spec 004 ADR-001), depois do throttler: aplica a declaração da rota,
 * com negação por padrão. Rotas de casamento seguem para o WeddingMemberGuard, que confere o papel.
 * Sem o aceite da versão vigente dos termos, só /auth/me, logout e o aceite passam (spec 015 RF10).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access?.kind === 'public') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = await this.sessions.authenticate(req);
    const termsExempt = this.reflector.getAllAndOverride<boolean | undefined>(TERMS_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (user.termsAcceptedVersion !== TERMS_VERSION && !termsExempt) {
      throw new TermsAcceptanceRequired();
    }

    if (access?.kind === 'authenticated') return true;
    if (access?.kind === 'superadmin') {
      if (!user.isSuperadmin) throw new ForbiddenRole();
      return true;
    }
    // @Roles ou sem declaração: só existe em rota de casamento; fora dela, nega.
    if (!isPanelWeddingRoute(req)) throw new ForbiddenRole();
    return true;
  }
}
