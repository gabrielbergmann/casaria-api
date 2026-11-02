import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// O nome no OpenAPI vem da classe (HealthDto). meta({ id }) na raiz de um DTO de resposta
// gera schema duplicado no cleanupOpenApiDoc do nestjs-zod 5.5; fica para schemas aninhados.
export const HealthSchema = z.object({ status: z.literal('ok') });

export class HealthDto extends createZodDto(HealthSchema) {}
