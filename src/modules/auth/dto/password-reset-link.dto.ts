import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreatePasswordResetLinkSchema = z.object({
  email: z.email({ error: 'Informe um email válido.' }),
});

export class CreatePasswordResetLinkDto extends createZodDto(CreatePasswordResetLinkSchema) {}

export const PasswordResetLinkSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });

export class PasswordResetLinkDto extends createZodDto(PasswordResetLinkSchema) {}
