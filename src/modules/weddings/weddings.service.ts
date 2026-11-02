import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../infra/config/env.schema';
import type { Tx } from '../../infra/prisma/transaction-runner';
import { isDueForAnonymization } from './anonymization-date';
import { WeddingNotFound } from './errors/wedding-not-found';
import { WeddingSlugInvalid } from './errors/wedding-slug-invalid';
import { WeddingSlugUnavailable } from './errors/wedding-slug-unavailable';
import { classifyHost } from './host';
import { isValidSlug } from './slug';
import { WEDDING_FILES, type WeddingFiles } from './wedding-files';
import { type WeddingDetails, WeddingsRepository } from './weddings.repository';

export type HostResolution =
  | { kind: 'wedding'; weddingId: string; slug: string }
  | { kind: 'redirect'; slug: string }
  | { kind: 'not_found' }
  | { kind: 'not_wedding_host' };

@Injectable()
export class WeddingsService {
  private readonly appDomain: string;

  constructor(
    private readonly repository: WeddingsRepository,
    config: ConfigService<Env, true>,
    @Inject(WEDDING_FILES) private readonly files: WeddingFiles,
  ) {
    this.appDomain = config.get('APP_DOMAIN', { infer: true });
  }

  /** Entrada do HTML por host: no máximo duas consultas por índice único (RNF02). */
  async resolveHost(host: string): Promise<HostResolution> {
    const classified = classifyHost(host, this.appDomain);
    if (classified.kind === 'unknown') return { kind: 'not_found' };
    if (classified.kind !== 'site') return { kind: 'not_wedding_host' };
    const weddingId = await this.repository.findIdBySlug(classified.slug);
    if (weddingId) return { kind: 'wedding', weddingId, slug: classified.slug };
    const target = await this.repository.findRedirectTarget(classified.slug, new Date());
    return target ? { kind: 'redirect', slug: target } : { kind: 'not_found' };
  }

  /** Casamento pelo slug atual; redirecionado ou inexistente → 404 (RF09). */
  async findIdBySlug(slug: string): Promise<string> {
    const weddingId = isValidSlug(slug) ? await this.repository.findIdBySlug(slug) : null;
    if (!weddingId) throw new WeddingNotFound();
    return weddingId;
  }

  exists(weddingId: string): Promise<boolean> {
    return this.repository.exists(weddingId);
  }

  listIds(): Promise<string[]> {
    return this.repository.listIds();
  }

  /** Casamentos cujo prazo de 6 meses chegou e ainda sem marca (spec 015 RF01). */
  async listIdsDueForAnonymization(now: Date): Promise<string[]> {
    const candidates = await this.repository.listNotAnonymizedUntil(now);
    return candidates
      .filter((wedding) => isDueForAnonymization(wedding.weddingDate, now))
      .map((wedding) => wedding.id);
  }

  markAnonymized(weddingId: string, now: Date): Promise<void> {
    return this.repository.markAnonymized(weddingId, now);
  }

  /** Recusa formato inválido, reservado ou slug de outro casamento (atual ou redirecionado). */
  async assertSlugAvailable(weddingId: string | null, slug: string): Promise<void> {
    if (!isValidSlug(slug)) throw new WeddingSlugInvalid();
    if (await this.repository.isSlugTakenByAnother(weddingId, slug, new Date())) {
      throw new WeddingSlugUnavailable();
    }
  }

  async changeSlug(weddingId: string, newSlug: string): Promise<void> {
    const currentSlug = await this.repository.findSlug(weddingId);
    if (currentSlug === null) throw new WeddingNotFound();
    if (currentSlug === newSlug) return;
    await this.assertSlugAvailable(weddingId, newSlug);
    const changed = await this.repository.changeSlug(weddingId, currentSlug, newSlug, new Date());
    if (!changed) throw new WeddingSlugUnavailable();
  }

  /** Cria o casamento (spec 005 RF01), dentro da transação de quem orquestra. */
  async create(details: WeddingDetails, tx?: Tx): Promise<string> {
    await this.assertSlugAvailable(null, details.slug);
    const weddingId = await this.repository.create(details, tx);
    if (!weddingId) throw new WeddingSlugUnavailable();
    return weddingId;
  }

  async getDetails(weddingId: string): Promise<WeddingDetails> {
    const details = await this.repository.findDetails(weddingId);
    if (!details) throw new WeddingNotFound();
    return details;
  }

  /** Nome do casal, data e slug (spec 005 RF10); o slug segue as regras e o 301 da 003. */
  async update(weddingId: string, changes: Partial<WeddingDetails>): Promise<WeddingDetails> {
    if (changes.slug !== undefined) await this.changeSlug(weddingId, changes.slug);
    const { coupleName, weddingDate } = changes;
    if (coupleName !== undefined || weddingDate !== undefined) {
      await this.repository.updateDetails(weddingId, { coupleName, weddingDate });
    }
    return this.getDetails(weddingId);
  }

  /**
   * Apaga os arquivos e só então o casamento (spec 005 RF11): se o storage falhar, nada sai do
   * banco e repetir é seguro.
   */
  async delete(weddingId: string): Promise<void> {
    await this.files.deleteWeddingFiles(weddingId);
    await this.repository.delete(weddingId);
  }

  listAll() {
    return this.repository.listAll();
  }
}
