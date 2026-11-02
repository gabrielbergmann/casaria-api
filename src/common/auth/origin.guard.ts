import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Env } from '../../infra/config/env.schema';
import { isPanelOrigin } from '../../infra/config/public-urls';
import { ForbiddenOrigin } from '../../modules/auth/errors/forbidden-origin';
import { ACCESS_KEY, type AccessDeclaration, PANEL_ORIGIN_KEY } from './access.decorators';
import { SAFE_METHODS } from './safe-methods';

/**
 * SameSite=Lax não barra requisições de <slug>.<dominio>, que é o mesmo site do painel: rota com
 * sessão que altera estado exige o Origin do painel (spec 004 RF07).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly env: Pick<Env, 'NODE_ENV' | 'APP_DOMAIN' | 'DEV_PANEL_URL'>;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.env = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
      DEV_PANEL_URL: config.get('DEV_PANEL_URL', { infer: true }),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const targets = [context.getHandler(), context.getClass()];
    const access = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(
      ACCESS_KEY,
      targets,
    );
    const panelOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      PANEL_ORIGIN_KEY,
      targets,
    );
    if (access?.kind === 'public' && !panelOnly) return true;
    if (!isPanelOrigin(req.headers.origin, this.env)) throw new ForbiddenOrigin();
    return true;
  }
}
