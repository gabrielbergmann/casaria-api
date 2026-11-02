import { randomBytes } from 'node:crypto';
import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const valid = {
    NODE_ENV: 'development',
    APP_DOMAIN: 'casaria.test',
    DATABASE_URL: 'postgresql://casaria:secret-db-pass@localhost:5432/casaria',
    REDIS_URL: 'redis://localhost:6379',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SESSION_SECRET: 'x'.repeat(32),
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'casaria-dev',
    S3_ACCESS_KEY_ID: 'casaria',
    S3_SECRET_ACCESS_KEY: 'casaria-s3-secret',
    S3_PUBLIC_BASE_URL: 'http://localhost:8333/casaria-dev/',
    MP_CLIENT_ID: 'mp-client-id',
    MP_CLIENT_SECRET: 'mp-client-secret',
    MP_WEBHOOK_SECRET: 'mp-webhook-secret',
  };

  it('accepts a complete environment and applies the default port', () => {
    const env = validateEnv(valid);

    expect(env.PORT).toBe(3000);
    expect(env.MP_OAUTH_PUBLIC_KEY_FIELD).toBe('public_key');
    expect(env.APP_DOMAIN).toBe('casaria.test');
  });

  it('drops variables outside the schema', () => {
    const env = validateEnv({ ...valid, HOME: '/root' });

    expect(env).not.toHaveProperty('HOME');
  });

  it('rejects a missing DATABASE_URL naming the variable', () => {
    const { DATABASE_URL, ...withoutDatabase } = valid;

    expect(() => validateEnv(withoutDatabase)).toThrow('DATABASE_URL: obrigatória');
  });

  it('rejects an ENCRYPTION_KEY without 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64');

    expect(() => validateEnv({ ...valid, ENCRYPTION_KEY: shortKey })).toThrow(
      'ENCRYPTION_KEY: deve ter 32 bytes em base64',
    );
  });

  it('never echoes the invalid values in the error', () => {
    const invalid = {
      ...valid,
      DATABASE_URL: 'mysql://root:top-secret@db/app',
      ENCRYPTION_KEY: 'x',
    };

    try {
      validateEnv(invalid);
      throw new Error('expected validateEnv to throw');
    } catch (error) {
      const text = (error as Error).message;
      expect(text).toContain('DATABASE_URL');
      expect(text).toContain('ENCRYPTION_KEY');
      expect(text).not.toContain('top-secret');
      expect(text).not.toContain('mysql://');
    }
  });

  it('rejects a SESSION_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...valid, SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
  });

  it('reads the S3 settings with path style off by default and no trailing slash', () => {
    const env = validateEnv(valid);

    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.S3_PUBLIC_BASE_URL).toBe('http://localhost:8333/casaria-dev');
    expect(validateEnv({ ...valid, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('accepts a relative storage path only in development', () => {
    const dev = { ...valid, NODE_ENV: 'development', S3_PUBLIC_BASE_URL: '/storage/casaria/' };

    expect(validateEnv(dev).S3_PUBLIC_BASE_URL).toBe('/storage/casaria');
    expect(() => validateEnv({ ...dev, NODE_ENV: 'test' })).toThrow('S3_PUBLIC_BASE_URL');
    expect(() => validateEnv({ ...valid, S3_PUBLIC_BASE_URL: 'ftp://x' })).toThrow(
      'S3_PUBLIC_BASE_URL',
    );
  });

  it('rejects a missing S3 secret without echoing the other values', () => {
    const { S3_SECRET_ACCESS_KEY, ...withoutSecret } = valid;

    expect(() => validateEnv(withoutSecret)).toThrow('S3_SECRET_ACCESS_KEY: obrigatória');
    expect(() => validateEnv({ ...valid, S3_FORCE_PATH_STYLE: 'talvez' })).toThrow(
      'S3_FORCE_PATH_STYLE: deve ser true ou false',
    );
  });

  it('requires WEB_DIST_DIR only in production', () => {
    expect(validateEnv(valid).WEB_DIST_DIR).toBeUndefined();
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      'WEB_DIST_DIR: obrigatória em produção',
    );
    expect(
      validateEnv({ ...valid, NODE_ENV: 'production', WEB_DIST_DIR: '/app/web-dist' }).WEB_DIST_DIR,
    ).toBe('/app/web-dist');
  });

  it.each(['https://casaria.test', 'casaria.test:3000', 'Casaria.Test'])(
    'rejects APP_DOMAIN %s',
    (appDomain) => {
      expect(() => validateEnv({ ...valid, APP_DOMAIN: appDomain })).toThrow('APP_DOMAIN');
    },
  );
});
