import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PasswordSchema } from '../password';

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: 'Informe a senha atual.' }),
  newPassword: PasswordSchema,
});

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
