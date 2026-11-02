import { Injectable } from '@nestjs/common';
import type { DisconnectReason, PaymentAccountStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface PaymentAccountRecord {
  providerUserId: string;
  publicKey: string;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
  status: PaymentAccountStatus;
  disconnectReason: DisconnectReason | null;
  connectedAt: Date;
  disconnectedAt: Date | null;
}

/** Tokens já cifrados: o repository nunca vê token em claro. */
export interface EncryptedTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
}

const ACCOUNT = {
  providerUserId: true,
  publicKey: true,
  accessTokenEnc: true,
  refreshTokenEnc: true,
  expiresAt: true,
  status: true,
  disconnectReason: true,
  connectedAt: true,
  disconnectedAt: true,
} as const;

// Conta Mercado Pago do casal (spec 012). Todo método filtra pelo weddingId, exceto o achado pelo
// usuário do Mercado Pago, exceção documentada no ADR-002 da 012.
@Injectable()
export class PaymentAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(weddingId: string): Promise<PaymentAccountRecord | null> {
    return this.prisma.paymentAccount.findUnique({ where: { weddingId }, select: ACCOUNT });
  }

  /** Conecta ou reconecta (uma conta por casamento). */
  async saveConnected(
    weddingId: string,
    data: EncryptedTokens & { providerUserId: string; publicKey: string; connectedAt: Date },
  ): Promise<void> {
    const connected = {
      ...data,
      status: 'CONNECTED' as const,
      disconnectReason: null,
      disconnectedAt: null,
    };
    await this.prisma.paymentAccount.upsert({
      where: { weddingId },
      create: { weddingId, ...connected },
      update: connected,
    });
  }

  /**
   * Troca os tokens renovados só se o refresh token gravado ainda for o usado: outra instância que
   * renovou antes vence (as rotinas podem rodar em mais de uma instância, PRD ADR-006).
   */
  async saveRefreshed(
    weddingId: string,
    usedRefreshTokenEnc: string,
    data: EncryptedTokens & { providerUserId?: string; publicKey?: string },
  ): Promise<boolean> {
    const { count } = await this.prisma.paymentAccount.updateMany({
      where: { weddingId, status: 'CONNECTED', refreshTokenEnc: usedRefreshTokenEnc },
      data,
    });
    return count === 1;
  }

  /** Apaga os tokens e guarda o motivo (RF03). Com usedRefreshTokenEnc, só se ele não mudou. */
  async disconnect(
    weddingId: string,
    reason: DisconnectReason,
    now: Date,
    usedRefreshTokenEnc?: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.paymentAccount.updateMany({
      where: {
        weddingId,
        status: 'CONNECTED',
        ...(usedRefreshTokenEnc ? { refreshTokenEnc: usedRefreshTokenEnc } : {}),
      },
      data: {
        status: 'DISCONNECTED',
        disconnectReason: reason,
        disconnectedAt: now,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
      },
    });
    return count === 1;
  }

  /** Exceção à regra do weddingId (ADR-002 da 012): o aviso de desautorização só traz o usuário. */
  async findConnectedWeddingIds(providerUserId: string): Promise<string[]> {
    const rows = await this.prisma.paymentAccount.findMany({
      where: { providerUserId, status: 'CONNECTED' },
      select: { weddingId: true },
    });
    return rows.map((row) => row.weddingId);
  }
}
