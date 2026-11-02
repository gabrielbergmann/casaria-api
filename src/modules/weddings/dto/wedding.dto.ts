import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const coupleName = z
  .string()
  .trim()
  .min(1, { error: 'Informe o nome do casal.' })
  .max(120, { error: 'Use até 120 caracteres.' });
// Instante em UTC com fuso explícito; o painel converte de America/Sao_Paulo.
const weddingDate = z.iso.datetime({ offset: true, error: 'Informe a data e a hora.' });
// O formato do slug é conferido no service, para responder wedding.slug_invalid.
const slug = z.string().trim();

export const WeddingDetailsSchema = z.object({
  coupleName: z.string(),
  weddingDate: z.iso.datetime(),
  slug: z.string(),
});

export class WeddingDetailsDto extends createZodDto(WeddingDetailsSchema) {}

export const UpdateWeddingSchema = z.object({
  coupleName: coupleName.optional(),
  weddingDate: weddingDate.optional(),
  slug: slug.optional(),
});

export class UpdateWeddingDto extends createZodDto(UpdateWeddingSchema) {}

export const CreateWeddingFields = { coupleName, weddingDate, slug };
