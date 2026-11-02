import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PasswordSchema } from '../password';

export const PasswordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});

export class PasswordResetDto extends createZodDto(PasswordResetSchema) {}
