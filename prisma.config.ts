import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho; em produção as variáveis já vêm do ambiente.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Mesma DATABASE_URL da API. Vazia, o generate funciona e os comandos de banco falham.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
