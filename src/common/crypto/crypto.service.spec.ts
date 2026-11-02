import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema';
import { CryptoService } from './crypto.service';
import { DecryptionFailed } from './decryption-failed';

describe('CryptoService', () => {
  const key = randomBytes(32).toString('base64');
  const config = { get: () => key } as unknown as ConfigService<Env, true>;
  const service = new CryptoService(config);
  const plain = '123.456.789-09';

  const tamper = (payload: string, index: number) => {
    const parts = payload.split(':');
    const bytes = Buffer.from(parts[index], 'base64');
    bytes[0] ^= 0xff;
    parts[index] = bytes.toString('base64');
    return parts.join(':');
  };

  const decryptError = (payload: string): Error => {
    try {
      service.decrypt(payload);
    } catch (error) {
      return error as Error;
    }
    throw new Error('expected decrypt to throw');
  };

  it('produces different ciphertexts for the same text and decrypts both', () => {
    const first = service.encrypt(plain);
    const second = service.encrypt(plain);

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe(plain);
    expect(service.decrypt(second)).toBe(plain);
  });

  it('uses the {iv}:{authTag}:{ciphertext} format with a 12-byte iv', () => {
    const [iv, authTag, ciphertext] = service.encrypt(plain).split(':');

    expect(Buffer.from(iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(authTag, 'base64')).toHaveLength(16);
    expect(ciphertext.length).toBeGreaterThan(0);
  });

  it.each([
    ['authTag', 1],
    ['ciphertext', 2],
  ])('rejects a tampered %s without leaking the text or the key', (_part, index) => {
    const error = decryptError(tamper(service.encrypt(plain), index));

    expect(error).toBeInstanceOf(DecryptionFailed);
    expect(error.message).not.toContain(plain);
    expect(error.message).not.toContain(key);
  });

  it('rejects a payload encrypted with another key', () => {
    const otherKey = randomBytes(32).toString('base64');
    const other = new CryptoService({ get: () => otherKey } as unknown as ConfigService<Env, true>);

    expect(decryptError(other.encrypt(plain))).toBeInstanceOf(DecryptionFailed);
  });

  it('rejects a malformed payload', () => {
    expect(decryptError('not-encrypted')).toBeInstanceOf(DecryptionFailed);
  });
});
