import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { hashToken } from '../../common/crypto/token';
import type { Env } from '../../infra/config/env.schema';
import type { TransactionRunner } from '../../infra/prisma/transaction-runner';
import { MemberAlreadyExists } from './errors/member-already-exists';
import { MemberInvitationAccountExists } from './errors/member-invitation-account-exists';
import { MemberInvitationEmailMismatch } from './errors/member-invitation-email-mismatch';
import { MemberInvitationInvalid } from './errors/member-invitation-invalid';
import type { MemberInvitationsRepository } from './member-invitations.repository';
import { MemberInvitationsService } from './member-invitations.service';
import type { MembersRepository } from './members.repository';
import type { UsersRepository } from './users.repository';

jest.mock('./password', () => ({
  hashPassword: jest.fn(async (password: string) => `hash:${password}`),
}));

describe('MemberInvitationsService', () => {
  const invitations = {
    upsert: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    findValidByTokenHash: jest.fn(),
    consume: jest.fn(),
  };
  const members = { existsByEmail: jest.fn(), findRole: jest.fn(), create: jest.fn() };
  const users = { findIdByEmail: jest.fn(), createWithPassword: jest.fn() };
  const tx = { tx: true };
  const transactions = { run: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
  const env: Record<string, string> = { NODE_ENV: 'production', APP_DOMAIN: 'casaria.test' };
  const service = new MemberInvitationsService(
    invitations as unknown as MemberInvitationsRepository,
    members as unknown as MembersRepository,
    users as unknown as UsersRepository,
    transactions as unknown as TransactionRunner,
    { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>,
  );
  const now = new Date('2027-03-10T12:00:00Z');
  const pending = {
    weddingId: 'wedding-a',
    email: 'bia@example.com',
    role: 'editor',
    wedding: { coupleName: 'Ana & Bia' },
  };
  const bia = {
    id: 'user-bia',
    email: 'bia@example.com',
    name: 'Bia',
    isSuperadmin: false,
    sessionVersion: 0,
    termsAcceptedVersion: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    invitations.upsert.mockImplementation(async (_weddingId, invite) => ({
      id: 'inv-1',
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    }));
  });

  afterEach(() => jest.useRealTimers());

  describe('invite', () => {
    it('returns a 7-day link with the token in the fragment and stores only its hash', async () => {
      members.existsByEmail.mockResolvedValue(false);

      const created = await service.invite('wedding-a', ' Bia@Example.com ', 'editor');

      const token = new URL(created.link).hash.replace('#token=', '');
      expect(created.link).toMatch(/^https:\/\/app\.casaria\.test\/invite#token=/);
      expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(16);
      expect(created.expiresAt).toEqual(new Date('2027-03-17T12:00:00Z'));
      const [, stored] = invitations.upsert.mock.calls[0];
      expect(stored).toEqual({
        email: 'bia@example.com',
        role: 'editor',
        tokenHash: hashToken(token),
        expiresAt: new Date('2027-03-17T12:00:00Z'),
      });
      expect(JSON.stringify(invitations.upsert.mock.calls)).not.toContain(token);
    });

    it('replaces the pending invitation of the same email with a new token', async () => {
      members.existsByEmail.mockResolvedValue(false);

      const first = await service.invite('wedding-a', 'bia@example.com', 'editor');
      const second = await service.invite('wedding-a', 'bia@example.com', 'owner');

      expect(second.link).not.toBe(first.link);
      expect(invitations.upsert.mock.calls[1][1].tokenHash).not.toBe(
        invitations.upsert.mock.calls[0][1].tokenHash,
      );
    });

    it('rejects an email that is already a member with 409 member.already_exists', async () => {
      members.existsByEmail.mockResolvedValue(true);

      await expect(service.invite('wedding-a', 'bia@example.com', 'editor')).rejects.toBeInstanceOf(
        MemberAlreadyExists,
      );
      expect(invitations.upsert).not.toHaveBeenCalled();
    });

    it('uses the transaction it receives', async () => {
      members.existsByEmail.mockResolvedValue(false);

      await service.invite('wedding-a', 'ana@example.com', 'owner', tx as never);

      expect(invitations.upsert).toHaveBeenCalledWith('wedding-a', expect.any(Object), tx);
    });
  });

  describe('lookup', () => {
    it('shows couple, role, email and whether an account exists', async () => {
      invitations.findValidByTokenHash.mockResolvedValue(pending);
      users.findIdByEmail.mockResolvedValue(null);

      await expect(service.lookup('token-1')).resolves.toEqual({
        coupleName: 'Ana & Bia',
        role: 'editor',
        email: 'bia@example.com',
        accountExists: false,
      });
      expect(invitations.findValidByTokenHash).toHaveBeenCalledWith(hashToken('token-1'), now);
    });

    it('rejects an unknown, expired, used or cancelled link', async () => {
      invitations.findValidByTokenHash.mockResolvedValue(null);

      await expect(service.lookup('token-1')).rejects.toMatchObject({
        status: 404,
        code: 'member_invitation.invalid',
      });
    });
  });

  describe('accept', () => {
    beforeEach(() => invitations.findValidByTokenHash.mockResolvedValue(pending));

    it('creates the membership and consumes the invitation in one transaction', async () => {
      members.findRole.mockResolvedValue(null);
      invitations.consume.mockResolvedValue(true);

      await expect(service.accept('token-1', bia)).resolves.toBe('wedding-a');
      expect(invitations.consume).toHaveBeenCalledWith('wedding-a', hashToken('token-1'), now, tx);
      expect(members.create).toHaveBeenCalledWith('wedding-a', 'user-bia', 'editor', tx);
    });

    it('rejects a session of another email with 403 and changes nothing', async () => {
      const error = await service
        .accept('token-1', { ...bia, email: 'outra@example.com' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(MemberInvitationEmailMismatch);
      expect(error).toMatchObject({ status: 403, code: 'member_invitation.email_mismatch' });
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('rejects someone who is already a member', async () => {
      members.findRole.mockResolvedValue('editor');

      await expect(service.accept('token-1', bia)).rejects.toBeInstanceOf(MemberAlreadyExists);
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('lets only one of two concurrent accepts create the membership', async () => {
      members.findRole.mockResolvedValue(null);
      invitations.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const results = await Promise.allSettled([
        service.accept('token-1', bia),
        service.accept('token-1', bia),
      ]);

      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(MemberInvitationInvalid);
      expect(members.create).toHaveBeenCalledTimes(1);
    });

    it('works until the 7th day and is refused afterwards', async () => {
      members.findRole.mockResolvedValue(null);
      invitations.consume.mockResolvedValue(true);
      const expiresAt = new Date('2027-03-17T12:00:00Z');
      invitations.findValidByTokenHash.mockImplementation(async (_hash, at: Date) =>
        at < expiresAt ? pending : null,
      );

      jest.setSystemTime(new Date('2027-03-17T11:59:59Z'));
      await expect(service.accept('token-1', bia)).resolves.toBe('wedding-a');

      jest.setSystemTime(new Date('2027-03-17T12:00:01Z'));
      await expect(service.accept('token-1', bia)).rejects.toBeInstanceOf(MemberInvitationInvalid);
    });
  });

  describe('acceptWithSignup', () => {
    beforeEach(() => invitations.findValidByTokenHash.mockResolvedValue(pending));

    it('creates account, membership and consumes the invitation together', async () => {
      users.findIdByEmail.mockResolvedValue(null);
      invitations.consume.mockResolvedValue(true);
      users.createWithPassword.mockResolvedValue(bia);

      await expect(service.acceptWithSignup('token-1', 'Bia', 'uma-senha-boa')).resolves.toEqual({
        user: bia,
        weddingId: 'wedding-a',
      });
      expect(users.createWithPassword).toHaveBeenCalledWith(
        { email: 'bia@example.com', name: 'Bia', passwordHash: 'hash:uma-senha-boa' },
        tx,
      );
      expect(members.create).toHaveBeenCalledWith('wedding-a', 'user-bia', 'editor', tx);
    });

    it('sends someone with an account to the login with 409 member_invitation.account_exists', async () => {
      users.findIdByEmail.mockResolvedValue('user-bia');

      await expect(
        service.acceptWithSignup('token-1', 'Bia', 'uma-senha-boa'),
      ).rejects.toBeInstanceOf(MemberInvitationAccountExists);
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('turns a concurrent signup with the same email into account_exists', async () => {
      users.findIdByEmail.mockResolvedValue(null);
      invitations.consume.mockResolvedValue(true);
      users.createWithPassword.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.acceptWithSignup('token-1', 'Bia', 'uma-senha-boa'),
      ).rejects.toBeInstanceOf(MemberInvitationAccountExists);
      expect(members.create).not.toHaveBeenCalled();
    });
  });

  it('cancels only an invitation of the same wedding', async () => {
    invitations.delete.mockResolvedValue(false);

    await expect(service.cancel('wedding-a', 'inv-of-b')).rejects.toBeInstanceOf(
      MemberInvitationInvalid,
    );
    expect(invitations.delete).toHaveBeenCalledWith('wedding-a', 'inv-of-b');
  });
});
