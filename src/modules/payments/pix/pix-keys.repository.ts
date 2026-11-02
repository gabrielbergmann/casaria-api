import { Injectable } from '@nestjs/common';
import type { PixKeyType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface PixKeyRecord {
  keyType: PixKeyType;
  key: string;
}

// Chave Pix do casamento (spec 017). Todo método filtra pelo weddingId.
@Injectable()
export class PixKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(weddingId: string): Promise<PixKeyRecord | null> {
    return this.prisma.pixKey.findUnique({
      where: { weddingId },
      select: { keyType: true, key: true },
    });
  }

  async save(weddingId: string, pixKey: PixKeyRecord): Promise<void> {
    await this.prisma.pixKey.upsert({
      where: { weddingId },
      create: { weddingId, ...pixKey },
      update: pixKey,
    });
  }

  /** False quando não havia chave. */
  async remove(weddingId: string): Promise<boolean> {
    const { count } = await this.prisma.pixKey.deleteMany({ where: { weddingId } });
    return count === 1;
  }
}
