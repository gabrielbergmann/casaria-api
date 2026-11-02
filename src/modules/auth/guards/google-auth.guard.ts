import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainError } from '../../../common/errors/domain-error';
import { GoogleFailed } from '../errors/google-failed';

export interface GoogleCallbackRequest {
  googleError?: string;
}

// Na volta do Google, a falha não vira erro JSON: o controller leva ao /login?error=<code>.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ) {
    if (user && !err) return user;
    const req = context.switchToHttp().getRequest<GoogleCallbackRequest>();
    req.googleError = err instanceof DomainError ? err.code : new GoogleFailed().code;
    return null;
  }
}
