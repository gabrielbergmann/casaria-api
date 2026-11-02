import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';
import type { SessionUser } from '../../common/auth/session-user';
import { generateToken, hashToken } from '../../common/crypto/token';
import { TERMS_VERSION } from '../../common/personal-data/terms';
import type { Env } from '../../infra/config/env.schema';
import { panelOrigin } from '../../infra/config/public-urls';
import { normalizeEmail } from './email';
import { CurrentPasswordInvalid } from './errors/current-password-invalid';
import { GoogleAccountNotRegistered } from './errors/google-account-not-registered';
import { GoogleFailed } from './errors/google-failed';
import { InvalidCredentials } from './errors/invalid-credentials';
import { ResetLinkInvalid } from './errors/reset-link-invalid';
import { TermsVersionOutdated } from './errors/terms-version-outdated';
import { UserNotFound } from './errors/user-not-found';
import { MembersService } from './members.service';
import { hashPassword, verifyPassword } from './password';
import { UsersRepository } from './users.repository';

const RESET_LINK_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly panel: string;

  constructor(
    private readonly users: UsersRepository,
    private readonly members: MembersService,
    config: ConfigService<Env, true>,
  ) {
    this.panel = panelOrigin({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
      DEV_PANEL_URL: config.get('DEV_PANEL_URL', { infer: true }),
    });
  }

  /** Email inexistente, sem senha ou senha errada: sempre auth.invalid_credentials (RF02). */
  async validateCredentials(email: string, password: string): Promise<SessionUser> {
    const user = await this.users.findCredentialsByEmail(normalizeEmail(email));
    const matches = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !matches) throw new InvalidCredentials();
    const { passwordHash: _hash, ...sessionUser } = user;
    return sessionUser;
  }

  /** Só email verificado de usuário existente; o Google nunca cria usuário (RF04). */
  async validateGoogleProfile(profile: Profile): Promise<SessionUser> {
    const email = profile.emails?.[0];
    if (!email?.value || email.verified !== true) throw new GoogleFailed();
    const user = await this.users.findSessionUserByEmail(normalizeEmail(email.value));
    if (!user) throw new GoogleAccountNotRegistered();
    return user;
  }

  async me(user: SessionUser) {
    const memberships = await this.members.listByUser(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      memberships,
      termsAcceptanceRequired: user.termsAcceptedVersion !== TERMS_VERSION,
    };
  }

  /** Grava versão e data do aceite em UTC; versão diferente da vigente é recusada (RF11). */
  async acceptTerms(userId: string, version: string): Promise<void> {
    if (version !== TERMS_VERSION) throw new TermsVersionOutdated();
    await this.users.acceptTerms(userId, version, new Date());
  }

  /** Define a senha (troca, redefinição ou aceite de convite) e devolve a nova versão de sessão. */
  async setPassword(userId: string, password: string): Promise<number> {
    return this.users.setPassword(userId, await hashPassword(password));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const currentHash = await this.users.findPasswordHash(userId);
    if (!(await verifyPassword(currentPassword, currentHash))) throw new CurrentPasswordInvalid();
    return this.setPassword(userId, newPassword);
  }

  /** Link de uso único por 24 horas; gerar outro invalida o anterior (RF13). */
  async createPasswordResetLink(email: string) {
    const userId = await this.users.findIdByEmail(normalizeEmail(email));
    if (!userId) throw new UserNotFound();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + RESET_LINK_TTL_MS);
    await this.users.setPasswordResetToken(userId, hashToken(token), expiresAt);
    return {
      url: `${this.panel}/redefinir-senha#token=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Grava a nova senha e encerra todas as sessões do usuário (versão + 1). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const reset = await this.users.resetPasswordByToken(hashToken(token), passwordHash, new Date());
    if (!reset) throw new ResetLinkInvalid();
  }

  panelUrl(path = '/'): string {
    return `${this.panel}${path}`;
  }
}
