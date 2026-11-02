import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../common/auth/session-user';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';

const SESSION_USER = {
  id: true,
  email: true,
  name: true,
  isSuperadmin: true,
  sessionVersion: true,
  termsAcceptedVersion: true,
} as const;

// users é tabela global (sem weddingId).
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSessionUser(userId: string): Promise<SessionUser | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: SESSION_USER });
  }

  findSessionUserByEmail(email: string): Promise<SessionUser | null> {
    return this.prisma.user.findUnique({ where: { email }, select: SESSION_USER });
  }

  findCredentialsByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { ...SESSION_USER, passwordHash: true },
    });
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }

  async findIdByEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    return user?.id ?? null;
  }

  /** Grava a senha, descarta link de redefinição pendente e invalida as sessões (versão + 1). */
  async setPassword(userId: string, passwordHash: string): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
    return user.sessionVersion;
  }

  /** Só o último aceite fica (spec 015 ADR-003). */
  async acceptTerms(userId: string, version: string, now: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedVersion: version, termsAcceptedAt: now },
    });
  }

  /** Um link por usuário: gravar outro substitui o anterior. */
  async setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
    });
  }

  /** Consome o link numa única escrita condicional: uso único mesmo com pedidos simultâneos. */
  async resetPasswordByToken(tokenHash: string, passwordHash: string, now: Date) {
    const { count } = await this.prisma.user.updateMany({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: now } },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    return count === 1;
  }

  /** Conta criada no aceite de um convite (spec 005); sem cadastro aberto. */
  createWithPassword(
    user: { email: string; name: string; passwordHash: string },
    db: Tx,
  ): Promise<SessionUser> {
    return db.user.create({ data: user, select: SESSION_USER });
  }
}
