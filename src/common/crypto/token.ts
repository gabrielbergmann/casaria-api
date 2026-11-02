import { createHash, randomBytes } from 'node:crypto';

/** Token aleatório para links de uso único; 32 bytes = 256 bits, em base64url. */
export const generateToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** O banco guarda só o SHA-256 do token (skill seguranca). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
