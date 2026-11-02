import { compare, hash } from 'bcrypt';
import { z } from 'zod';

const BCRYPT_COST = 12;
const BCRYPT_MAX_BYTES = 72;

// Política única de senha (spec 004 RF12): 10 caracteres ou mais e até 72 bytes (limite do bcrypt).
export const PasswordSchema = z
  .string()
  .min(10, { error: 'A senha precisa ter pelo menos 10 caracteres.' })
  .refine((password) => Buffer.byteLength(password) <= BCRYPT_MAX_BYTES, {
    error: 'Senha longa demais.',
  });

// Hash fixo para comparar quando o email não existe ou não tem senha: o tempo de resposta não
// revela o motivo da recusa (RF02).
const DUMMY_HASH = '$2b$12$W6gRV.v6sJtzfksnU1pPSuBFOo9JLwvlo..Id.GPThrJ0EXMpX7Sy';

export const hashPassword = (password: string) => hash(password, BCRYPT_COST);

export async function verifyPassword(password: string, passwordHash: string | null) {
  const matches = await compare(password, passwordHash ?? DUMMY_HASH);
  return matches && passwordHash !== null;
}
