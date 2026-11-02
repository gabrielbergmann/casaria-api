import { Injectable, OnModuleInit } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { TransactionRunner } from '../../infra/prisma/transaction-runner';
import { MediaService, type MediaView } from '../media/media.service';
import { WeddingNotFound } from '../weddings/errors/wedding-not-found';
import { isPostWedding } from '../weddings/post-wedding';
import { WeddingsService } from '../weddings/weddings.service';
import { SiteDocumentTooLarge } from './errors/site-document-too-large';
import { SiteInvalidAlbumMedia } from './errors/site-invalid-album-media';
import { SiteInvalidConfig } from './errors/site-invalid-config';
import { initialSiteConfig } from './initial-site-config';
import {
  POST_WEDDING_SECTIONS,
  SITE_DOCUMENT_MAX_BYTES,
  type SectionType,
  type SiteConfig,
  SiteConfigSchema,
} from './site-config.schema';
import { upgradeSiteConfig, withoutSections } from './site-config-upgrade';
import { albumMediaIds, collectMediaIds } from './site-media';
import { type SiteConfigRow, SiteRepository } from './site.repository';

export interface PanelSite {
  draft: SiteConfig;
  publishedAt: Date | null;
  updatedAt: Date | null;
  coupleName: string;
  weddingDate: Date;
  media: Record<string, MediaView>;
}

export interface PublicSite {
  coupleName: string;
  weddingDate: Date;
  config: SiteConfig;
  media: Record<string, MediaView>;
}

/** Meta do HTML do site (spec 007 ADR-001), sem escape: quem escreve o HTML escapa. */
export interface SitePageMeta {
  title: string;
  description: string;
  ogImage: string | null;
}

const LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeZone: 'America/Sao_Paulo',
});

/** 413 antes do schema (RF08), medido no JSON do documento recebido; a versão 1 é migrada. */
function parseDocument(body: unknown): SiteConfig {
  if (Buffer.byteLength(JSON.stringify(body ?? null)) > SITE_DOCUMENT_MAX_BYTES) {
    throw new SiteDocumentTooLarge();
  }
  const result = SiteConfigSchema.safeParse(upgradeSiteConfig(body));
  if (result.success) return result.data;
  throw new SiteInvalidConfig(
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

/**
 * Documento do site (spec 007): rascunho, publicação, leitura pública e meta do link. Registra no
 * MediaService o verificador de uso das imagens do rascunho e do publicado (RF14), álbum incluído
 * (spec 014). Antes da data do casamento, o site público não recebe álbum nem agradecimento.
 */
@Injectable()
export class SiteService implements OnModuleInit {
  constructor(
    private readonly repository: SiteRepository,
    private readonly weddings: WeddingsService,
    private readonly media: MediaService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.media.registerUsageChecker({
      place: 'site',
      isInUse: (weddingId, mediaId) => this.usesMedia(weddingId, mediaId),
    });
  }

  /** Rascunho salvo ou, sem linha, o documento inicial, sem gravar (RF06). */
  async getForPanel(weddingId: string): Promise<PanelSite> {
    const [row, details] = await Promise.all([
      this.findRow(weddingId),
      this.weddings.getDetails(weddingId),
    ]);
    const draft = row?.draft ?? initialSiteConfig();
    return {
      draft,
      publishedAt: row?.publishedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      coupleName: details.coupleName,
      weddingDate: details.weddingDate,
      media: await this.media.resolve(weddingId, collectMediaIds(draft)),
    };
  }

  /** Valida e substitui o rascunho inteiro; vence o último (RF07, RF08). */
  async saveDraft(weddingId: string, body: unknown): Promise<PanelSite> {
    const draft = parseDocument(body);
    await this.assertAlbumMedia(weddingId, draft);
    await this.repository.saveDraft(weddingId, draft);
    return this.getForPanel(weddingId);
  }

  /** Copia o rascunho (ou o inicial) para o publicado, numa transação (RF09). */
  async publish(weddingId: string): Promise<{ publishedAt: Date }> {
    const publishedAt = new Date();
    await this.transactions.run(async (tx) => {
      const row = await this.repository.find(weddingId, tx);
      const config = row ? parseDocument(row.draft) : initialSiteConfig();
      await this.assertAlbumMedia(weddingId, config);
      await this.repository.publish(weddingId, config, publishedAt, tx);
    });
    return { publishedAt };
  }

  /** Casamento do slug atual com site publicado; senão, o mesmo 404 (RF05). */
  async findPublishedWeddingId(slug: string): Promise<string> {
    const weddingId = await this.weddings.findIdBySlug(slug);
    if (!(await this.repository.isPublished(weddingId))) throw new WeddingNotFound();
    return weddingId;
  }

  /**
   * Versão publicada para o site; null enquanto não houver (RF01, RF05). Até a data do casamento,
   * sem álbum e agradecimento e sem as fotos só deles (spec 014 RF04, ADR-002).
   */
  async getPublic(weddingId: string): Promise<PublicSite | null> {
    const row = await this.findRow(weddingId);
    if (!row?.published) return null;
    const details = await this.weddings.getDetails(weddingId);
    const config = isPostWedding(details.weddingDate, this.clock.now())
      ? row.published
      : withoutSections(row.published, POST_WEDDING_SECTIONS);
    return {
      coupleName: details.coupleName,
      weddingDate: details.weddingDate,
      config,
      media: await this.media.resolve(weddingId, collectMediaIds(config)),
    };
  }

  /** Seção ativa na versão publicada; sem publicação, falso (spec 013 ADR-002). */
  async isPublishedSectionEnabled(weddingId: string, type: SectionType): Promise<boolean> {
    const row = await this.findRow(weddingId);
    return row?.published?.sections.some((s) => s.type === type && s.enabled) ?? false;
  }

  /** Título, descrição e og:image da capa publicada, derivados do cadastro (ADR-001). */
  async getPageMeta(weddingId: string): Promise<SitePageMeta | null> {
    const site = await this.getPublic(weddingId);
    if (!site) return null;
    const coverId = site.config.theme.coverMediaId;
    return {
      title: site.coupleName,
      description: `Casamento em ${LONG_DATE.format(site.weddingDate)}`,
      ogImage: (coverId && site.media[coverId]?.urls.og) ?? null,
    };
  }

  /** Linha com os documentos já na versão atual (skill site-e-tema §2). */
  private async findRow(weddingId: string): Promise<SiteConfigRow | null> {
    const row = await this.repository.find(weddingId);
    if (!row) return null;
    return {
      ...row,
      draft: upgradeSiteConfig(row.draft),
      published: row.published && upgradeSiteConfig(row.published),
    };
  }

  /** Fotos do álbum conferidas em lote: todas do casamento, senão nada é gravado (spec 014 RF03). */
  private async assertAlbumMedia(weddingId: string, config: SiteConfig): Promise<void> {
    const ids = albumMediaIds(config);
    if (ids.length === 0) return;
    const resolved = await this.media.resolve(weddingId, ids);
    if (ids.some((id) => !resolved[id])) throw new SiteInvalidAlbumMedia();
  }

  private async usesMedia(weddingId: string, mediaId: string): Promise<boolean> {
    const row = await this.findRow(weddingId);
    if (!row) return false;
    const documents = row.published ? [row.draft, row.published] : [row.draft];
    return documents.some((config) => collectMediaIds(config).includes(mediaId));
  }
}
