import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../../common/auth/session-user';
import { generateToken, hashToken } from '../../common/crypto/token';
import type { WeddingRole } from '../../generated/prisma/enums';
import type { Env } from '../../infra/config/env.schema';
import { panelOrigin } from '../../infra/config/public-urls';
import { type Tx, TransactionRunner } from '../../infra/prisma/transaction-runner';
import { isUniqueViolation } from '../../infra/prisma/unique-violation';
import { normalizeEmail } from './email';
import { MemberAlreadyExists } from './errors/member-already-exists';
import { MemberInvitationAccountExists } from './errors/member-invitation-account-exists';
import { MemberInvitationEmailMismatch } from './errors/member-invitation-email-mismatch';
import { MemberInvitationInvalid } from './errors/member-invitation-invalid';
import { MemberInvitationsRepository } from './member-invitations.repository';
import { MembersRepository } from './members.repository';
import { hashPassword } from './password';
import { UsersRepository } from './users.repository';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Convite com o link; o token em claro só existe nesta resposta (ADR-001 da 005). */
export interface CreatedInvitation {
  id: string;
  email: string;
  role: WeddingRole;
  expiresAt: Date;
  link: string;
}

@Injectable()
export class MemberInvitationsService {
  private readonly panel: string;

  constructor(
    private readonly invitations: MemberInvitationsRepository,
    private readonly members: MembersRepository,
    private readonly users: UsersRepository,
    private readonly transactions: TransactionRunner,
    config: ConfigService<Env, true>,
  ) {
    this.panel = panelOrigin({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
      DEV_PANEL_URL: config.get('DEV_PANEL_URL', { infer: true }),
    });
  }

  /**
   * Link válido por 7 dias para um email que ainda não é membro (RF03). Convidar de novo, ou
   * "gerar novo link", substitui o convite pendente e invalida o link anterior.
   */
  async invite(
    weddingId: string,
    rawEmail: string,
    role: WeddingRole,
    tx?: Tx,
  ): Promise<CreatedInvitation> {
    const email = normalizeEmail(rawEmail);
    if (await this.members.existsByEmail(weddingId, email)) throw new MemberAlreadyExists();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await this.invitations.upsert(
      weddingId,
      { email, role, tokenHash: hashToken(token), expiresAt },
      tx,
    );
    return { ...invitation, link: `${this.panel}/invite#token=${token}` };
  }

  async cancel(weddingId: string, invitationId: string): Promise<void> {
    if (!(await this.invitations.delete(weddingId, invitationId)))
      throw new MemberInvitationInvalid();
  }

  /** O que a tela de aceite precisa para escolher o caminho (RF05). */
  async lookup(token: string) {
    const invitation = await this.findValid(token);
    const accountExists = (await this.users.findIdByEmail(invitation.email)) !== null;
    return {
      coupleName: invitation.wedding.coupleName,
      role: invitation.role,
      email: invitation.email,
      accountExists,
    };
  }

  /** Aceite com a conta da sessão, que precisa ser a do email convidado (RF04, RF06, RF07). */
  async accept(token: string, user: SessionUser): Promise<string> {
    const invitation = await this.findValid(token);
    if (normalizeEmail(user.email) !== invitation.email) throw new MemberInvitationEmailMismatch();
    if ((await this.members.findRole(invitation.weddingId, user.id)) !== null) {
      throw new MemberAlreadyExists();
    }
    await this.transactions.run(async (tx) => {
      await this.consume(invitation.weddingId, token, tx);
      await this.addMember(invitation.weddingId, user.id, invitation.role, tx);
    });
    return invitation.weddingId;
  }

  /** Aceite de quem não tem conta: conta, vínculo e consumo do convite na mesma transação. */
  async acceptWithSignup(token: string, name: string, password: string) {
    const invitation = await this.findValid(token);
    if ((await this.users.findIdByEmail(invitation.email)) !== null) {
      throw new MemberInvitationAccountExists();
    }
    const passwordHash = await hashPassword(password);
    const user = await this.transactions.run(async (tx) => {
      await this.consume(invitation.weddingId, token, tx);
      const created = await this.createAccount(invitation.email, name, passwordHash, tx);
      await this.addMember(invitation.weddingId, created.id, invitation.role, tx);
      return created;
    });
    return { user, weddingId: invitation.weddingId };
  }

  private async findValid(token: string) {
    const invitation = await this.invitations.findValidByTokenHash(hashToken(token), new Date());
    if (!invitation) throw new MemberInvitationInvalid();
    return invitation;
  }

  private async consume(weddingId: string, token: string, tx: Tx): Promise<void> {
    const consumed = await this.invitations.consume(weddingId, hashToken(token), new Date(), tx);
    if (!consumed) throw new MemberInvitationInvalid();
  }

  private async createAccount(email: string, name: string, passwordHash: string, tx: Tx) {
    try {
      return await this.users.createWithPassword({ email, name, passwordHash }, tx);
    } catch (error) {
      throw isUniqueViolation(error) ? new MemberInvitationAccountExists() : error;
    }
  }

  private async addMember(weddingId: string, userId: string, role: WeddingRole, tx: Tx) {
    try {
      await this.members.create(weddingId, userId, role, tx);
    } catch (error) {
      throw isUniqueViolation(error) ? new MemberAlreadyExists() : error;
    }
  }
}
