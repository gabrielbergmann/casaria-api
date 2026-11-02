import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema';
import { DecryptionFailed } from './decryption-failed';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

// AES-256-GCM com a chave única ENCRYPTION_KEY (ADR-009). Formato: {iv}:{authTag}:{ciphertext} em base64.
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const encodedKey = config.get('ENCRYPTION_KEY', { infer: true });
    this.key = Buffer.from(encodedKey, 'base64');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) throw new DecryptionFailed();
    const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) throw new DecryptionFailed();
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new DecryptionFailed();
    }
  }
}
