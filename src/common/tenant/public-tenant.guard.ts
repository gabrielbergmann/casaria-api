import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SiteService } from '../../modules/site/site.service';
import type { TenantRequest } from './tenant-context';

/**
 * Guard das rotas /v1/public/sites/:slug/... (spec 003 RF09, spec 007 RF05): resolve só pelo
 * slug atual de casamento com site publicado; slug redirecionado, inválido, inexistente ou nunca
 * publicado → 404 wedding.not_found, inclusive para membros. O módulo que o usa importa o
 * SiteModule.
 */
@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(
    private readonly sites: SiteService,
    @InjectPinoLogger(PublicTenantGuard.name) private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
    const weddingId = await this.sites.findPublishedWeddingId(slug);
    req.tenant = { weddingId };
    this.logger.assign({ weddingId });
    return true;
  }
}
