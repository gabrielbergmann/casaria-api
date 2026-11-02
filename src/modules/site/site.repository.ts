import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Tx } from '../../infra/prisma/transaction-runner';
import type { SiteConfig } from './site-config.schema';

export interface SiteConfigRow {
  /** Já validado pelo SiteConfigSchema ao gravar. */
  draft: SiteConfig;
  published: SiteConfig | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

const ROW = { draft: true, published: true, publishedAt: true, updatedAt: true } as const;

const asJson = (config: SiteConfig) => config as unknown as Prisma.InputJsonValue;

@Injectable()
export class SiteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(weddingId: string, db: Tx = this.prisma): Promise<SiteConfigRow | null> {
    const row = await db.siteConfig.findUnique({ where: { weddingId }, select: ROW });
    return row as unknown as SiteConfigRow | null;
  }

  async isPublished(weddingId: string): Promise<boolean> {
    const row = await this.prisma.siteConfig.findUnique({
      where: { weddingId },
      select: { publishedAt: true },
    });
    return row?.publishedAt != null;
  }

  /** Substitui o rascunho inteiro; o publicado não muda (RF07). */
  async saveDraft(weddingId: string, draft: SiteConfig): Promise<SiteConfigRow> {
    const row = await this.prisma.siteConfig.upsert({
      where: { weddingId },
      create: { weddingId, draft: asJson(draft) },
      update: { draft: asJson(draft) },
      select: ROW,
    });
    return row as unknown as SiteConfigRow;
  }

  /** Grava o documento como publicado; sem linha, ele também vira o rascunho (RF09). */
  async publish(weddingId: string, config: SiteConfig, now: Date, db: Tx = this.prisma) {
    const data = { published: asJson(config), publishedAt: now };
    await db.siteConfig.upsert({
      where: { weddingId },
      create: { weddingId, draft: asJson(config), ...data },
      update: data,
    });
  }
}
