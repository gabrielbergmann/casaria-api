import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Observable } from 'rxjs';
import { SAFE_METHODS } from '../auth/safe-methods';
import type { TenantRequest } from '../tenant/tenant-context';
import { AuditService } from './audit.service';

/**
 * Toda requisição do superadmin que altera estado vira superadmin.request (spec 004 RF11), com
 * método, modelo da rota e status final, inclusive em falha; leituras não são auditadas.
 */
@Injectable()
export class SuperadminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    @InjectPinoLogger(SuperadminAuditInterceptor.name) private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<TenantRequest>();
    const res = http.getResponse<Response>();
    const user = req.user;
    if (user?.isSuperadmin && !SAFE_METHODS.has(req.method)) {
      // No fim da resposta o status já é o definitivo, inclusive o do filtro de erros.
      res.once('finish', () => {
        this.audit
          .record({
            action: 'superadmin.request',
            actorUserId: user.id,
            weddingId: req.tenant?.weddingId ?? null,
            metadata: {
              method: req.method,
              route: req.route?.path ?? null,
              statusCode: res.statusCode,
            },
          })
          .catch((err: unknown) => this.logger.error({ err }, 'audit_failed'));
      });
    }
    return next.handle();
  }
}
