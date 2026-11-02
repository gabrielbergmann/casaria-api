import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';
import { hashToken } from '../../common/crypto/token';
import { TERMS_VERSION } from '../../common/personal-data/terms';
import type { Env } from '../../infra/config/env.schema';
import { AuthService } from './auth.service';
import { CurrentPasswordInvalid } from './errors/current-password-invalid';
import { GoogleAccountNotRegistered } from './errors/google-account-not-registered';
import { GoogleFailed } from './errors/google-failed';
import { InvalidCredentials } from './errors/invalid-credentials';
import { ResetLinkInvalid } from './errors/reset-link-invalid';
import { TermsVersionOutdated } from './errors/terms-version-outdated';
import { UserNotFound } from './errors/user-not-found';
import type { MembersService } from './members.service';
import type { UsersRepository } from './users.repository';

// bcrypt de verdade fica no password.spec; aqui um hash previsível deixa o teste rápido.
jest.mock('./password', () => ({
  hashPassword: jest.fn(async (password: string) => `hash:${password}`),
  verifyPassword: jest.fn(
    async (password: string, hash: string | null) => hash === `hash:${password}`,
  ),
}));

describe('AuthService', () => {
  const users = {
    findCredentialsByEmail: jest.fn(),
    findSessionUserByEmail: jest.fn(),
    findPasswordHash: jest.fn(),
    findIdByEmail: jest.fn(),
    setPassword: jest.fn(),
    setPasswordResetToken: jest.fn(),
    resetPasswordByToken: jest.fn(),
    acceptTerms: jest.fn(),
  };
  const members = { listByUser: jest.fn() };
  const env: Record<string, string> = { NODE_ENV: 'production', APP_DOMAIN: 'casaria.test' };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
  const service = new AuthService(
    users as unknown as UsersRepository,
    members as unknown as MembersService,
    config,
  );
  const ana = {
    id: 'user-ana',
    email: 'ana@example.com',
    name: 'Ana',
    isSuperadmin: false,
    sessionVersion: 3,
    termsAcceptedVersion: null,
  };

  beforeEach(() => jest.clearAllMocks());

  describe('validateCredentials', () => {
    it('returns the session user without the hash for the right password', async () => {
      users.findCredentialsByEmail.mockResolvedValue({
        ...ana,
        passwordHash: 'hash:senha-correta',
      });

      await expect(
        service.validateCredentials('  Ana@Example.com ', 'senha-correta'),
      ).resolves.toEqual(ana);
      expect(users.findCredentialsByEmail).toHaveBeenCalledWith('ana@example.com');
    });

    it.each([
      ['an unknown email', null],
      ['a wrong password', { ...ana, passwordHash: 'hash:outra-senha' }],
      ['a user without password', { ...ana, passwordHash: null }],
    ])('answers the same 401 for %s', async (_case, stored) => {
      users.findCredentialsByEmail.mockResolvedValue(stored);

      const error = await service
        .validateCredentials('ana@example.com', 'senha-correta')
        .catch((e) => e);

      expect(error).toBeInstanceOf(InvalidCredentials);
      expect(error).toMatchObject({ status: 401, code: 'auth.invalid_credentials' });
    });
  });

  describe('validateGoogleProfile', () => {
    const profile = (value: string, verified: boolean) =>
      ({ emails: [{ value, verified }] }) as Profile;

    it('accepts a verified email of an existing user', async () => {
      users.findSessionUserByEmail.mockResolvedValue(ana);

      await expect(
        service.validateGoogleProfile(profile('ANA@example.com', true)),
      ).resolves.toEqual(ana);
      expect(users.findSessionUserByEmail).toHaveBeenCalledWith('ana@example.com');
    });

    it('rejects an unverified email without looking for the user', async () => {
      await expect(
        service.validateGoogleProfile(profile('ana@example.com', false)),
      ).rejects.toBeInstanceOf(GoogleFailed);
      expect(users.findSessionUserByEmail).not.toHaveBeenCalled();
    });

    it('never creates a user for an unknown Google account', async () => {
      users.findSessionUserByEmail.mockResolvedValue(null);

      await expect(
        service.validateGoogleProfile(profile('novo@example.com', true)),
      ).rejects.toBeInstanceOf(GoogleAccountNotRegistered);
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      users.findPasswordHash.mockResolvedValue('hash:senha-atual-1');

      await expect(
        service.changePassword(ana.id, 'errada-123', 'nova-senha-1'),
      ).rejects.toBeInstanceOf(CurrentPasswordInvalid);
      expect(users.setPassword).not.toHaveBeenCalled();
    });

    it('stores the new hash and returns the new session version', async () => {
      users.findPasswordHash.mockResolvedValue('hash:senha-atual-1');
      users.setPassword.mockResolvedValue(4);

      await expect(service.changePassword(ana.id, 'senha-atual-1', 'nova-senha-1')).resolves.toBe(
        4,
      );
      expect(users.setPassword).toHaveBeenCalledWith(ana.id, 'hash:nova-senha-1');
    });
  });

  describe('password reset link', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2027-03-10T12:00:00Z')));
    afterEach(() => jest.useRealTimers());

    it('returns a one-time link for 24 hours and stores only the token hash', async () => {
      users.findIdByEmail.mockResolvedValue(ana.id);

      const link = await service.createPasswordResetLink(' ANA@example.com');

      const token = new URL(link.url).hash.replace('#token=', '');
      expect(link.url).toMatch(/^https:\/\/app\.casaria\.test\/redefinir-senha#token=/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(link.expiresAt).toBe('2027-03-11T12:00:00.000Z');
      expect(users.setPasswordResetToken).toHaveBeenCalledWith(
        ana.id,
        hashToken(token),
        new Date(link.expiresAt),
      );
    });

    it('answers 404 auth.user_not_found for an unknown email', async () => {
      users.findIdByEmail.mockResolvedValue(null);

      await expect(service.createPasswordResetLink('ninguem@example.com')).rejects.toBeInstanceOf(
        UserNotFound,
      );
    });

    it('resets the password through the token hash', async () => {
      users.resetPasswordByToken.mockResolvedValue(true);

      await service.resetPassword('token-do-link', 'nova-senha-1');

      expect(users.resetPasswordByToken).toHaveBeenCalledWith(
        hashToken('token-do-link'),
        'hash:nova-senha-1',
        new Date('2027-03-10T12:00:00Z'),
      );
    });

    it('rejects a used, expired or replaced link with 400 auth.reset_link_invalid', async () => {
      users.resetPasswordByToken.mockResolvedValue(false);

      const error = await service.resetPassword('token-antigo', 'nova-senha-1').catch((e) => e);

      expect(error).toBeInstanceOf(ResetLinkInvalid);
      expect(error).toMatchObject({ status: 400, code: 'auth.reset_link_invalid' });
    });
  });

  it('lists the memberships in /auth/me', async () => {
    members.listByUser.mockResolvedValue([{ weddingId: 'wedding-a', role: 'owner' }]);

    await expect(service.me(ana)).resolves.toEqual({
      id: ana.id,
      name: 'Ana',
      email: ana.email,
      isSuperadmin: false,
      memberships: [{ weddingId: 'wedding-a', role: 'owner' }],
      termsAcceptanceRequired: true,
    });
  });

  describe('terms (spec 015)', () => {
    it('stops asking for acceptance once the current version was accepted (RF10)', async () => {
      members.listByUser.mockResolvedValue([]);

      await expect(
        service.me({ ...ana, termsAcceptedVersion: TERMS_VERSION }),
      ).resolves.toMatchObject({ termsAcceptanceRequired: false });
      await expect(
        service.me({ ...ana, termsAcceptedVersion: '2000-01-01' }),
      ).resolves.toMatchObject({ termsAcceptanceRequired: true });
    });

    it('records the current version with the UTC instant (RF11)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2027-03-10T12:00:00Z'));

      await service.acceptTerms(ana.id, TERMS_VERSION);

      expect(users.acceptTerms).toHaveBeenCalledWith(
        ana.id,
        TERMS_VERSION,
        new Date('2027-03-10T12:00:00Z'),
      );
      jest.useRealTimers();
    });

    it('answers 409 terms.version_outdated for another version, without saving (RF11)', async () => {
      const error = await service.acceptTerms(ana.id, '2000-01-01').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TermsVersionOutdated);
      expect(error).toMatchObject({ status: 409, code: 'terms.version_outdated' });
      expect(users.acceptTerms).not.toHaveBeenCalled();
    });
  });
});
