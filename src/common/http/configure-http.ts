import { VersioningOptions, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Env } from '../../infra/config/env.schema';
import { buildCorsOrigin } from './cors-origin';
import { isSiteDraftJson, SITE_DRAFT_BODY_LIMIT } from './site-draft-body';

// Toda rota sai em /v1 (ADR-007). Usado também pela exportação do OpenAPI.
export const API_VERSIONING: VersioningOptions = { type: VersioningType.URI, defaultVersion: '1' };

export function configureHttp(
  app: NestExpressApplication,
  env: Pick<Env, 'NODE_ENV' | 'APP_DOMAIN'>,
) {
  // Um proxy na frente da API: req.ip real no throttler e cookie secure (risco na spec 002).
  app.set('trust proxy', 1);

  const secureHeaders = helmet();
  // A CSP padrão quebra o Swagger UI; ela só é relaxada em /docs, que não existe em produção.
  const docsHeaders = helmet({ contentSecurityPolicy: false });
  const relaxDocs = env.NODE_ENV !== 'production';
  app.use((req: Request, res: Response, next: NextFunction) =>
    (relaxDocs && req.path.startsWith('/docs') ? docsHeaders : secureHeaders)(req, res, next),
  );

  // Antes do parser padrão: o primeiro que lê o corpo vence, e o padrão segue com 100 KB.
  app.useBodyParser('json', { limit: SITE_DRAFT_BODY_LIMIT, type: isSiteDraftJson });
  app.useBodyParser('json');

  app.enableCors({ origin: buildCorsOrigin(env.APP_DOMAIN, env.NODE_ENV), credentials: true });
  app.enableVersioning(API_VERSIONING);
  app.enableShutdownHooks();
}
