import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Versão aceita (AAAA-MM-DD); só a vigente é gravada (spec 015 RF11). */
export class TermsAcceptanceDto extends createZodDto(
  z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
) {}
