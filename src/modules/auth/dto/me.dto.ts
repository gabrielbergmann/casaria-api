import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  isSuperadmin: z.boolean(),
  memberships: z.array(z.object({ weddingId: z.uuid(), role: z.enum(['owner', 'editor']) })),
  /** Sem o aceite da versão vigente, o painel abre a tela de aceite (spec 015 RF10). */
  termsAcceptanceRequired: z.boolean(),
});

export class MeDto extends createZodDto(MeSchema) {}
