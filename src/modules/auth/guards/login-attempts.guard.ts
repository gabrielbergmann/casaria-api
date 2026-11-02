import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, minutes, type ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { TooManyLoginAttempts } from '../errors/too-many-login-attempts';

const WINDOW_MS = minutes(15);
const LIMIT = 10;

// 10 tentativas por IP a cada 15 minutos, certas ou erradas (spec 004 RF03), no mesmo storage
// Redis do throttler; também usado no aceite de convite com criação de conta (005).
@Injectable()
export class LoginAttemptsGuard implements CanActivate {
  constructor(@InjectThrottlerStorage() private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { isBlocked } = await this.storage.increment(
      req.ip ?? 'unknown',
      WINDOW_MS,
      LIMIT,
      WINDOW_MS,
      'login',
    );
    if (isBlocked) throw new TooManyLoginAttempts();
    return true;
  }
}
