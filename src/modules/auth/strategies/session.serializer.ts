import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { SessionUser } from '../../../common/auth/session-user';
import { UsersRepository } from '../users.repository';

// A sessão guarda só o id; o usuário (com papel de superadmin e versão) vem do banco a cada
// requisição, então revogação e mudança de papel valem na hora (RNF01, RNF02).
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly users: UsersRepository) {
    super();
  }

  serializeUser(user: SessionUser, done: (err: unknown, id?: string) => void): void {
    done(null, user.id);
  }

  deserializeUser(userId: string, done: (err: unknown, user?: SessionUser | false) => void): void {
    this.users
      .findSessionUser(userId)
      .then((user) => done(null, user ?? false))
      .catch((err) => done(err));
  }
}
