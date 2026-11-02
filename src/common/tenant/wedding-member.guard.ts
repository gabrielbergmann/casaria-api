import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { WeddingRole } from '../../generated/prisma/enums';
import { ForbiddenRole } from '../../modules/auth/errors/forbidden-role';
import { MembersService } from '../../modules/auth/members.service';
import { WeddingNotFound } from '../../modules/weddings/errors/wedding-not-found';
import { WeddingsService } from '../../modules/weddings/weddings.service';
import { ACCESS_KEY, type AccessDeclaration } from '../auth/access.decorators';
import { isPanelWeddingRoute } from './panel-route';
import type { TenantRequest } from './tenant-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Rota de casamento sem @Roles exige owner (PRD RF38).
const DEFAULT_ROLES: WeddingRole[] = ['owner'];

/**
 * Guard global do painel (spec 003 RF10–RF12, spec 004 RF08): o weddingId vem só do caminho e o
 * papel, do vínculo lido a cada requisição. Superadmin vale como owner em casamento existente. Sem
 * vínculo, id inválido ou inexistente: o mesmo 404 wedding.not_found; papel insuficiente: 403.
 */
@Injectable()
export class WeddingMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly weddings: WeddingsService,
    private readonly members: MembersService,
    @InjectPinoLogger(WeddingMemberGuard.name) private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    if (!isPanelWeddingRoute(req)) return true;

    const weddingId = req.params.weddingId;
    const user = req.user;
    if (!user || typeof weddingId !== 'string' || !UUID.test(weddingId))
      throw new WeddingNotFound();

    const role = await this.resolveRole(weddingId, user.id, user.isSuperadmin);
    if (!role) throw new WeddingNotFound();

    req.tenant = { weddingId, role };
    this.logger.assign({ weddingId });

    if (!this.requiredRoles(context).includes(role)) throw new ForbiddenRole();
    return true;
  }

  private requiredRoles(context: ExecutionContext): WeddingRole[] {
    const access = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return access?.kind === 'roles' ? access.roles : DEFAULT_ROLES;
  }

  private async resolveRole(
    weddingId: string,
    userId: string,
    isSuperadmin: boolean,
  ): Promise<WeddingRole | null> {
    if (isSuperadmin) return (await this.weddings.exists(weddingId)) ? 'owner' : null;
    return this.members.findRole(weddingId, userId);
  }
}
