import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

// operationId "Health_check" vira o hook useHealthCheck no client do orval.
const operationId = (controllerKey: string, methodKey: string) =>
  `${controllerKey.replace(/Controller$/, '')}_${methodKey}`;

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder().setTitle('CasarIA API').setVersion('1').build();
  const document = SwaggerModule.createDocument(app, config, { operationIdFactory: operationId });
  return cleanupOpenApiDoc(document);
}

// Swagger em /docs e o JSON em /docs-json; só fora de produção (RNF07).
export function mountSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
}
