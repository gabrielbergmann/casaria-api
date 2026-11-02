import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { API_VERSIONING } from '../../common/http/configure-http';
import { buildOpenApiDocument } from './openapi';

// Gera casaria-api/openapi.json sem subir a API. O modo preview monta o grafo de módulos sem
// instanciar providers, então Postgres e Redis não são acessados; as variáveis abaixo só
// satisfazem a validação do boot e nunca são usadas.
const PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  APP_DOMAIN: 'localhost',
  DATABASE_URL: 'postgresql://openapi@localhost:5432/openapi',
  REDIS_URL: 'redis://localhost:6379',
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(32).toString('base64'),
  GOOGLE_CLIENT_ID: 'openapi',
  GOOGLE_CLIENT_SECRET: 'openapi',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'openapi',
  S3_BUCKET: 'openapi',
  S3_ACCESS_KEY_ID: 'openapi',
  S3_SECRET_ACCESS_KEY: 'openapi',
  S3_PUBLIC_BASE_URL: 'http://localhost:8333/openapi',
  MP_CLIENT_ID: 'openapi',
  MP_CLIENT_SECRET: 'openapi',
  MP_WEBHOOK_SECRET: 'openapi',
};

async function exportOpenApi(): Promise<void> {
  for (const [name, value] of Object.entries(PLACEHOLDER_ENV)) process.env[name] = value;
  const { AppModule } = await import('../../app.module.js');
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.enableVersioning(API_VERSIONING);
  const target = resolve(process.cwd(), 'openapi.json');
  writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
}

void exportOpenApi();
