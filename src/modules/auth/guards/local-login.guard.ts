import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvalidCredentials } from '../errors/invalid-credentials';

// Qualquer falha (email inexistente, senha errada, sem senha, corpo vazio) vira o mesmo 401.
@Injectable()
export class LocalLoginGuard extends AuthGuard('local') {
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) throw new InvalidCredentials();
    return user;
  }
}
