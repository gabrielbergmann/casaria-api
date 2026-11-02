import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../infra/config/env.schema';
import { apiOrigin } from '../../../infra/config/public-urls';
import { WeddingsService } from '../../weddings/weddings.service';
import { SiteService } from '../site.service';
import { buildSiteCsp } from './site-csp';
import { injectMeta } from './site-meta';
import { loadTemplate, resolveStaticFile } from './web-dist';

const isApiPath = (path: string) =>
  path === '/v1' || path.startsWith('/v1/') || path.startsWith('/docs');

/**
 * Entrada do HTML por host (spec 003 RF05 e RF07, spec 007 RF02 e RF03). Os estáticos do build
 * saem em qualquer host que chegue à API; nos subdomínios de casamento, o index.html com as meta
 * do casamento publicado, o 301 do slug antigo ou o index.html sem dado de casamento com 404.
 * Rotas da API (/v1, /docs) seguem em qualquer host, e app., api., raiz e www passam adiante.
 */
@Injectable()
export class SiteHtmlMiddleware implements NestMiddleware {
  private readonly appDomain: string;
  private readonly distDir: string | undefined;
  private readonly template: string;
  private readonly csp: string;

  constructor(
    private readonly weddings: WeddingsService,
    private readonly site: SiteService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(SiteHtmlMiddleware.name) private readonly logger: PinoLogger,
  ) {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    this.appDomain = config.get('APP_DOMAIN', { infer: true });
    this.distDir = config.get('WEB_DIST_DIR', { infer: true });
    this.template = loadTemplate(this.distDir);
    const storageUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true });
    this.csp = buildSiteCsp({
      api: apiOrigin({ NODE_ENV: nodeEnv, APP_DOMAIN: this.appDomain }),
      storage: storageUrl.startsWith('/') ? "'self'" : new URL(storageUrl).origin,
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isApiPath(req.path) || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    const file = this.distDir ? resolveStaticFile(this.distDir, req.path) : null;
    if (file) return this.sendStatic(res, next, file);
    if (req.path.startsWith('/assets/')) {
      res.status(404).end();
      return;
    }

    const resolution = await this.weddings.resolveHost(req.headers.host ?? '');
    switch (resolution.kind) {
      case 'wedding':
        return this.sendWeddingPage(res, resolution.weddingId);
      case 'redirect':
        // no-cache: o navegador não guarda o 301 de um slug que vai ficar livre.
        res.setHeader('Cache-Control', 'no-cache');
        return res.redirect(301, `https://${resolution.slug}.${this.appDomain}${req.originalUrl}`);
      case 'not_found':
        return this.sendHtml(res, 404, this.template);
      default:
        return next();
    }
  }

  /** Nunca publicado dá o mesmo 404 do inexistente, inclusive para membros (RF05). */
  private async sendWeddingPage(res: Response, weddingId: string): Promise<void> {
    this.logger.assign({ weddingId });
    const meta = await this.site.getPageMeta(weddingId);
    if (!meta) return this.sendHtml(res, 404, this.template);
    this.sendHtml(res, 200, injectMeta(this.template, meta));
  }

  private sendHtml(res: Response, status: number, html: string): void {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', this.csp);
    res.status(status).type('html').send(html);
  }

  /** Os arquivos de assets/ têm hash no nome: cache de um ano (RNF02). */
  private sendStatic(res: Response, next: NextFunction, file: string): void {
    const immutable = file.startsWith('assets/');
    res.sendFile(
      file,
      { root: this.distDir, ...(immutable ? { maxAge: '1y', immutable: true } : {}) },
      (err) => {
        if (err && !res.headersSent) next(err);
      },
    );
  }
}
