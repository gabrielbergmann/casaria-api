import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaService } from './infra/prisma/prisma.service';
import { REDIS_CLIENT } from './infra/redis/redis-client';

// Monta o AppModule inteiro (módulos, guards globais, estratégias e middlewares) com Prisma e
// Redis falsos: pega erro de injeção de dependência sem banco, Redis, rede nem porta aberta.
describe('AppModule', () => {
  const env = {
    NODE_ENV: 'test',
    APP_DOMAIN: 'casaria.test',
    DATABASE_URL: 'postgresql://test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SESSION_SECRET: randomBytes(32).toString('base64'),
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'casaria-test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test-secret',
    S3_PUBLIC_BASE_URL: 'http://localhost:8333/casaria-test',
    MP_CLIENT_ID: 'mp-client-id',
    MP_CLIENT_SECRET: 'mp-client-secret',
    MP_WEBHOOK_SECRET: 'mp-webhook-secret',
  };

  beforeAll(() => Object.assign(process.env, env));

  it('wires every module without Postgres or Redis', async () => {
    // Importado depois do env: o ConfigModule valida as variáveis ao carregar o módulo.
    const { AppModule } = jest.requireActual<typeof import('./app.module')>('./app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ isOpen: false, eval: jest.fn() })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });

    await expect(app.init()).resolves.toBe(app);
    await app.close();
  });
});
