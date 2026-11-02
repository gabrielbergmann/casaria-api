import { ApiParam } from '@nestjs/swagger';

/**
 * Documenta o :weddingId das rotas do painel no OpenAPI. O controller não lê o parâmetro: o
 * weddingId vem do TenantContext gravado pelo WeddingMemberGuard.
 */
export const ApiWeddingParam = () =>
  ApiParam({ name: 'weddingId', type: String, format: 'uuid', required: true });
