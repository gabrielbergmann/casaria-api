import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AccessGuard } from './common/auth/access.guard';
import { OriginGuard } from './common/auth/origin.guard';
import { AuditModule } from './common/audit/audit.module';
import { SuperadminAuditInterceptor } from './common/audit/superadmin-audit.interceptor';
import { CryptoModule } from './common/crypto/crypto.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { type Env, validateEnv } from './infra/config/env.schema';
import { buildPinoHttpOptions } from './infra/logger/pino-http-options';
import { PrismaModule } from './infra/prisma/prisma.module';
import { REDIS_CLIENT, type RedisClient } from './infra/redis/redis-client';
import { RedisModule } from './infra/redis/redis.module';
import { RedisThrottlerStorage } from './infra/redis/redis-throttler.storage';
import { WeddingMemberGuard } from './common/tenant/wedding-member.guard';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { GiftsModule } from './modules/gifts/gifts.module';
import { GuestsModule } from './modules/guests/guests.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RsvpModule } from './modules/rsvp/rsvp.module';
import { SiteModule } from './modules/site/site.module';
import { WeddingsModule } from './modules/weddings/weddings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: buildPinoHttpOptions(config.get('NODE_ENV', { infer: true })),
      }),
    }),
    RedisModule,
    PrismaModule,
    CryptoModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisClient) => ({
        throttlers: [{ name: 'default', ttl: minutes(1), limit: 120 }], // por IP (RNF02)
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    ScheduleModule.forRoot(), // rotinas nos módulos donos (payments na 012, weddings na 015)
    HealthModule,
    WeddingsModule,
    MediaModule,
    SiteModule,
    GuestsModule,
    RsvpModule,
    GiftsModule,
    PaymentsModule,
    AuthModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: SuperadminAuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Ordem dos guards globais: rate limit → acesso (sessão e declaração) → Origin → casamento e papel.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: WeddingMemberGuard },
  ],
})
export class AppModule {}
