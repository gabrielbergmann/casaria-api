import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { SessionUser } from '../../common/auth/session-user';
import type { Env } from '../../infra/config/env.schema';
import { SessionRequired } from './errors/session-required';
import { SESSION_MAX_AGE_MS, sessionCookieName } from './session.options';

@Injectable()
export class SessionService {
  private readonly cookieName: string;
  private readonly secureCookie: boolean;

  constructor(config: ConfigService<Env, true>) {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    this.cookieName = sessionCookieName(nodeEnv);
    this.secureCookie = nodeEnv === 'production';
  }

  /** Inicia a sessão com id novo (o passport regenera no logIn) e guarda só id, início e versão. */
  async start(req: Request, user: SessionUser): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      req.logIn(user, (err) => (err ? reject(err) : resolve())),
    );
    req.session.createdAt = Date.now();
    req.session.sessionVersion = user.sessionVersion;
  }

  /** Usuário da sessão válida; mais de 30 dias desde o login ou versão antiga encerram a sessão. */
  async authenticate(req: Request): Promise<SessionUser> {
    const user = req.user as SessionUser | undefined;
    if (!user) throw new SessionRequired();
    const { createdAt, sessionVersion } = req.session;
    const expired = !createdAt || Date.now() - createdAt > SESSION_MAX_AGE_MS;
    if (expired || sessionVersion !== user.sessionVersion) {
      await this.destroy(req);
      throw new SessionRequired();
    }
    return user;
  }

  /** Mantém a sessão atual válida depois de uma troca de senha (as outras caem). */
  keepAfterPasswordChange(req: Request, sessionVersion: number): void {
    req.session.sessionVersion = sessionVersion;
  }

  async end(req: Request, res: Response): Promise<void> {
    await this.destroy(req);
    res.clearCookie(this.cookieName, {
      path: '/',
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'lax',
    });
  }

  private destroy(req: Request): Promise<void> {
    req.user = undefined;
    return new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
  }
}
