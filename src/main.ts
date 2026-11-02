import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { Logger } from 'nestjs-pino';
import passport from 'passport';
import { AppModule } from './app.module';
import { configureHttp } from './common/http/configure-http';
import type { Env } from './infra/config/env.schema';
import { mountSwagger } from './infra/openapi/openapi';
import { REDIS_CLIENT, type RedisClient } from './infra/redis/redis-client';
import { buildSessionOptions } from './modules/auth/session.options';

async function bootstrap(): Promise<void> {
  // Variável inválida, Postgres ou Redis fora: o Nest registra a causa e encerra com código 1.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  configureHttp(app, { NODE_ENV: nodeEnv, APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }) });
  // Sessão antes do passport: o passport recarrega o usuário da sessão a cada requisição.
  const sessionEnv = { nodeEnv, secret: config.get('SESSION_SECRET', { infer: true }) };
  app.use(session(buildSessionOptions(sessionEnv, app.get<RedisClient>(REDIS_CLIENT))));
  app.use(passport.initialize());
  app.use(passport.session());
  if (nodeEnv !== 'production') mountSwagger(app);

  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((err: unknown) => {
  new NestLogger('Bootstrap').error({ err }, 'bootstrap_failed');
  process.exit(1);
});
