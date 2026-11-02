import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.email({ error: 'Informe um email válido.' }),
  password: z.string().min(1, { error: 'Informe a senha.' }),
});

export class LoginDto extends createZodDto(LoginSchema) {}
