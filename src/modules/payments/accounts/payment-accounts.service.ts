import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AuditService } from '../../../common/audit/audit.service';
import { CryptoService } from '../../../common/crypto/crypto.service';
import type { RequestUser } from '../../../common/tenant/tenant-context';
import { Clock } from '../../../common/time/clock';
import type { DisconnectReason, PaymentAccountStatus } from '../../../generated/prisma/enums';
import { MembersService } from '../../auth/members.service';
import { PaymentAccountDisconnected, PaymentOAuthFailed } from '../errors/payment-errors';
import {
  type ConnectedAccount,
  PAYMENT_PROVIDER,
  type PaymentProvider,
  ProviderGrantRevoked,
  type ProviderTokens,
} from '../provider/payment-provider';
import type { OAuthSession } from './oauth-session';
import {
  type PaymentAccountRecord,
  PaymentAccountsRepository,
} from './payment-accounts.repository';
import { createPkcePair, newOAuthState } from './pkce';

const OAUTH_TTL_MS = 10 * 60_000;
/** Renova quando faltam 30 dias (PRD RF34). */
const RENEW_WINDOW_MS = 30 * 24 * 60 * 60_000;

export interface AccountStatusView {
  status: PaymentAccountStatus | 'NOT_CONNECTED';
  disconnectReason: DisconnectReason | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

export interface UsableAccount {
  account: ConnectedAccount;
  publicKey: string;
}

/**
 * Conta Mercado Pago do casal (spec 012 RF01 a RF04): OAuth com PKCE e state na sessão,
 * desconexão pelos três motivos, renovação e a regra de conta válida para o checkout.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    private readonly repository: PaymentAccountsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly members: MembersService,
    private readonly clock: Clock,
    @InjectPinoLogger(PaymentAccountsService.name) private readonly logger: PinoLogger,
  ) {}

  /** Novo par PKCE e state de uso único, ligados ao casamento e ao usuário (RF01). */
  startConnection(session: OAuthSession, weddingId: string, userId: string): string {
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = newOAuthState(weddingId);
    session.mpOAuth = {
      state,
      codeVerifier,
      weddingId,
      userId,
      issuedAt: this.clock.now().getTime(),
    };
    return this.provider.buildAuthorizationUrl(state, codeChallenge);
  }

  /** Retorno do OAuth: qualquer falha mantém a conta como estava (RF02). Devolve o casamento. */
  async completeConnection(
    session: OAuthSession,
    user: RequestUser,
    code: string | undefined,
    state: string | undefined,
  ): Promise<string> {
    const pending = session.mpOAuth;
    delete session.mpOAuth; // uso único, inclusive quando falha
    const now = this.clock.now();
    const valid =
      pending !== undefined &&
      !!code &&
      pending.state === state &&
      pending.userId === user.id &&
      now.getTime() - pending.issuedAt <= OAUTH_TTL_MS;
    if (!valid || !(await this.isOwner(pending.weddingId, user))) throw new PaymentOAuthFailed();

    let tokens: ProviderTokens;
    try {
      tokens = await this.provider.exchangeCode(code, pending.codeVerifier);
    } catch (err) {
      this.logger.warn({ err }, 'payment_oauth_exchange_failed');
      throw new PaymentOAuthFailed();
    }
    if (!tokens.providerUserId || !tokens.publicKey) {
      // Campo da public key diferente do configurado (MP_OAUTH_PUBLIC_KEY_FIELD).
      this.logger.warn('payment_oauth_incomplete_tokens');
      throw new PaymentOAuthFailed();
    }
    await this.repository.saveConnected(pending.weddingId, {
      providerUserId: tokens.providerUserId,
      publicKey: tokens.publicKey,
      ...this.encryptTokens(tokens),
      connectedAt: now,
    });
    await this.audit.record({
      action: 'payments.account_connected',
      actorUserId: user.id,
      weddingId: pending.weddingId,
      metadata: {},
    });
    return pending.weddingId;
  }

  async getStatus(weddingId: string): Promise<AccountStatusView> {
    const account = await this.repository.find(weddingId);
    if (!account) {
      return {
        status: 'NOT_CONNECTED',
        disconnectReason: null,
        connectedAt: null,
        disconnectedAt: null,
      };
    }
    return {
      status: account.status,
      disconnectReason: account.disconnectReason,
      connectedAt: account.connectedAt,
      disconnectedAt: account.disconnectedAt,
    };
  }

  async disconnectByOwner(weddingId: string, actorUserId: string): Promise<void> {
    await this.disconnect(weddingId, 'OWNER', actorUserId);
  }

  /** Conta conectada, com tokens e dentro da validade (PRD RF26). */
  async isCheckoutAvailable(weddingId: string): Promise<boolean> {
    return (await this.findUsable(weddingId)) !== null;
  }

  /** Conta para cobrar; sem ela, payment.account_disconnected (RF04). */
  async getUsable(weddingId: string): Promise<UsableAccount> {
    const usable = await this.findUsable(weddingId);
    if (!usable) throw new PaymentAccountDisconnected();
    return usable;
  }

  async findUsable(weddingId: string): Promise<UsableAccount | null> {
    const account = await this.repository.find(weddingId);
    if (!this.isValid(account)) return null;
    return {
      account: {
        accessToken: this.crypto.decrypt(account.accessTokenEnc),
        providerUserId: account.providerUserId,
      },
      publicKey: account.publicKey,
    };
  }

  /**
   * Rotina diária (RF13): renova o token que vence em até 30 dias. Grant recusado ou token já
   * vencido desconecta; erro passageiro tenta de novo amanhã.
   */
  async renewIfDue(weddingId: string): Promise<void> {
    const account = await this.repository.find(weddingId);
    const now = this.clock.now();
    if (!this.hasTokens(account) || account.expiresAt.getTime() - now.getTime() > RENEW_WINDOW_MS) {
      return;
    }
    const usedRefresh = account.refreshTokenEnc;
    try {
      const tokens = await this.provider.refreshTokens(this.crypto.decrypt(usedRefresh));
      await this.saveRefreshed(weddingId, usedRefresh, tokens);
      this.logger.info('payment_tokens_renewed');
    } catch (err) {
      if (err instanceof ProviderGrantRevoked || account.expiresAt <= now) {
        await this.disconnect(weddingId, 'REFRESH_FAILED', null, usedRefresh);
        return;
      }
      this.logger.warn({ err }, 'payment_tokens_renewal_retry');
    }
  }

  /**
   * Aviso de desautorização (RF03, PRD RF34a): confirmado com o Mercado Pago pelo refresh. Grant
   * recusado desconecta; aceito, a conta segue com os tokens renovados. Erro passageiro sobe para
   * o Mercado Pago reenviar.
   */
  async handleDeauthorization(providerUserId: string): Promise<void> {
    for (const weddingId of await this.repository.findConnectedWeddingIds(providerUserId)) {
      const account = await this.repository.find(weddingId);
      if (!this.hasTokens(account)) continue;
      const usedRefresh = account.refreshTokenEnc;
      try {
        const tokens = await this.provider.refreshTokens(this.crypto.decrypt(usedRefresh));
        await this.saveRefreshed(weddingId, usedRefresh, tokens);
        this.logger.warn({ weddingId }, 'payment_deauthorization_not_confirmed');
      } catch (err) {
        if (!(err instanceof ProviderGrantRevoked)) throw err;
        await this.disconnect(weddingId, 'DEAUTHORIZED', null, usedRefresh);
      }
    }
  }

  private async disconnect(
    weddingId: string,
    reason: DisconnectReason,
    actorUserId: string | null,
    usedRefreshTokenEnc?: string,
  ): Promise<void> {
    const now = this.clock.now();
    if (!(await this.repository.disconnect(weddingId, reason, now, usedRefreshTokenEnc))) return;
    this.logger.warn({ weddingId, reason }, 'payment_account_disconnected');
    await this.audit.record({
      action: 'payments.account_disconnected',
      actorUserId,
      weddingId,
      metadata: { reason },
    });
  }

  private async saveRefreshed(weddingId: string, usedRefresh: string, tokens: ProviderTokens) {
    await this.repository.saveRefreshed(weddingId, usedRefresh, {
      ...this.encryptTokens(tokens),
      ...(tokens.providerUserId ? { providerUserId: tokens.providerUserId } : {}),
      ...(tokens.publicKey ? { publicKey: tokens.publicKey } : {}),
    });
  }

  private encryptTokens(tokens: ProviderTokens) {
    return {
      accessTokenEnc: this.crypto.encrypt(tokens.accessToken),
      refreshTokenEnc: this.crypto.encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
    };
  }

  private hasTokens(account: PaymentAccountRecord | null): account is PaymentAccountRecord & {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: Date;
  } {
    return (
      account !== null &&
      account.status === 'CONNECTED' &&
      account.accessTokenEnc !== null &&
      account.refreshTokenEnc !== null &&
      account.expiresAt !== null
    );
  }

  private isValid(account: PaymentAccountRecord | null) {
    return this.hasTokens(account) && account.expiresAt > this.clock.now();
  }

  /** Só o owner conecta; o superadmin vale como owner (PRD RF38). */
  private async isOwner(weddingId: string, user: RequestUser): Promise<boolean> {
    if (user.isSuperadmin) return true;
    return (await this.members.findRole(weddingId, user.id)) === 'owner';
  }
}
