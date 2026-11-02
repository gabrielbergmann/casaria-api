import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../infra/config/env.schema';
import type { WeddingsService } from '../../weddings/weddings.service';
import type { SiteService } from '../site.service';
import { SiteHtmlMiddleware } from './site-html.middleware';

const INDEX_HTML =
  '<!doctype html><html lang="pt-BR"><head><!--site-meta--><title>CasarIA</title><!--/site-meta-->' +
  '<script type="module" src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>';

describe('SiteHtmlMiddleware', () => {
  let distDir: string;
  const weddings = { resolveHost: jest.fn() };
  const site = { getPageMeta: jest.fn() };
  const logger = { assign: jest.fn() };
  const next = jest.fn();

  const build = (env: Partial<Env> = {}) => {
    const values: Partial<Env> = {
      NODE_ENV: 'production',
      APP_DOMAIN: 'casaria.test',
      WEB_DIST_DIR: distDir,
      S3_PUBLIC_BASE_URL: 'https://media.casaria.test/bucket',
      ...env,
    };
    const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
    return new SiteHtmlMiddleware(
      weddings as unknown as WeddingsService,
      site as unknown as SiteService,
      config,
      logger as unknown as PinoLogger,
    );
  };

  const request = (host: string, originalUrl: string, method = 'GET') =>
    ({ method, headers: { host }, originalUrl, path: originalUrl.split('?')[0] }) as Request;

  const response = () => {
    const res = {
      setHeader: jest.fn(),
      redirect: jest.fn(),
      status: jest.fn(),
      type: jest.fn(),
      send: jest.fn(),
      end: jest.fn(),
      sendFile: jest.fn(),
      headersSent: false,
    };
    res.status.mockReturnValue(res);
    res.type.mockReturnValue(res);
    return res;
  };

  const sentHtml = (res: ReturnType<typeof response>) => res.send.mock.calls[0][0] as string;

  beforeAll(() => {
    distDir = mkdtempSync(join(tmpdir(), 'casaria-web-dist-'));
    mkdirSync(join(distDir, 'assets'));
    writeFileSync(join(distDir, 'index.html'), INDEX_HTML);
    writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)');
    writeFileSync(join(distDir, 'favicon.svg'), '<svg/>');
  });

  afterAll(() => rmSync(distDir, { recursive: true, force: true }));

  beforeEach(() => jest.resetAllMocks());

  it('serves the index.html of a published wedding with escaped meta, no-cache and the CSP', async () => {
    weddings.resolveHost.mockResolvedValue({
      kind: 'wedding',
      weddingId: 'wedding-a',
      slug: 'ana',
    });
    site.getPageMeta.mockResolvedValue({
      title: 'Ana & Bia"><script>alert(1)</script>',
      description: 'Casamento em 15 de maio de 2027',
      ogImage: 'https://media.casaria.test/bucket/weddings/a/media/m/og.jpg',
    });
    const res = response();

    await build().use(request('ana.casaria.test', '/'), res as unknown as Response, next);

    expect(site.getPageMeta).toHaveBeenCalledWith('wedding-a');
    expect(res.status).toHaveBeenCalledWith(200);
    const html = sentHtml(res);
    expect(html).toContain(
      '<title>Ana &amp; Bia&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>',
    );
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('<meta name="description" content="Casamento em 15 de maio de 2027">');
    expect(html).toContain('<meta property="og:title" content="Ana &amp; Bia');
    expect(html).toContain(
      '<meta property="og:image" content="https://media.casaria.test/bucket/weddings/a/media/m/og.jpg">',
    );
    expect(html).toContain('/assets/index-abc.js');
    expect(html).not.toContain('<title>CasarIA</title>');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    const [, csp] = res.setHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy');
    expect(csp).toContain("img-src 'self' data: https://media.casaria.test");
    expect(csp).toContain("connect-src 'self' https://api.casaria.test");
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain(
      "script-src 'self' https://sdk.mercadopago.com https://http2.mlstatic.com;",
    );
    expect(csp).toContain('frame-src https://*.mercadopago.com https://*.mercadolibre.com;');
    expect(csp).toContain('https://api.mercadopago.com');
    expect(csp).not.toMatch(/ https: |\*;/);
    expect(logger.assign).toHaveBeenCalledWith({ weddingId: 'wedding-a' });
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves og:image out when the published site has no cover', async () => {
    weddings.resolveHost.mockResolvedValue({
      kind: 'wedding',
      weddingId: 'wedding-a',
      slug: 'ana',
    });
    site.getPageMeta.mockResolvedValue({ title: 'Ana', description: 'Casamento', ogImage: null });
    const res = response();

    await build().use(request('ana.casaria.test', '/rsvp'), res as unknown as Response, next);

    expect(sentHtml(res)).not.toContain('og:image');
  });

  it('answers the same 404 body for a never published wedding, an unknown host and admin.', async () => {
    weddings.resolveHost.mockResolvedValueOnce({
      kind: 'wedding',
      weddingId: 'wedding-b',
      slug: 'b',
    });
    site.getPageMeta.mockResolvedValue(null);
    weddings.resolveHost.mockResolvedValueOnce({ kind: 'not_found' });
    weddings.resolveHost.mockResolvedValueOnce({ kind: 'not_found' });
    const middleware = build();
    const bodies: string[] = [];

    for (const host of ['rascunho.casaria.test', 'nao-existe.casaria.test', 'admin.casaria.test']) {
      const res = response();
      await middleware.use(request(host, '/'), res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(404);
      bodies.push(sentHtml(res));
    }

    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(INDEX_HTML);
  });

  it('answers 301 to the current slug keeping path and query, without caching', async () => {
    weddings.resolveHost.mockResolvedValue({ kind: 'redirect', slug: 'ana-e-bia' });
    const res = response();

    await build().use(
      request('ana-bia.casaria.test', '/rsvp?ref=wa'),
      res as unknown as Response,
      next,
    );

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://ana-e-bia.casaria.test/rsvp?ref=wa');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  it('serves the build files with a one-year immutable cache under assets/', async () => {
    const res = response();

    await build().use(
      request('ana.casaria.test', '/assets/index-abc.js'),
      res as unknown as Response,
      next,
    );

    expect(res.sendFile).toHaveBeenCalledWith(
      'assets/index-abc.js',
      { root: distDir, maxAge: '1y', immutable: true },
      expect.any(Function),
    );
    expect(weddings.resolveHost).not.toHaveBeenCalled();
  });

  it('serves other build files without the long cache', async () => {
    const res = response();

    await build().use(
      request('ana.casaria.test', '/favicon.svg'),
      res as unknown as Response,
      next,
    );

    expect(res.sendFile).toHaveBeenCalledWith(
      'favicon.svg',
      { root: distDir },
      expect.any(Function),
    );
  });

  it('never serves the raw index.html nor files outside WEB_DIST_DIR', async () => {
    weddings.resolveHost.mockResolvedValue({ kind: 'not_found' });

    for (const path of ['/index.html', '/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd']) {
      const res = response();
      await build().use(request('x.casaria.test', path), res as unknown as Response, next);
      expect(res.sendFile).not.toHaveBeenCalled();
    }
  });

  it('answers 404 for a missing asset instead of the HTML', async () => {
    const res = response();

    await build().use(
      request('ana.casaria.test', '/assets/old.js'),
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
    expect(weddings.resolveHost).not.toHaveBeenCalled();
  });

  it('lets the panel, the api, the root and www through', async () => {
    weddings.resolveHost.mockResolvedValue({ kind: 'not_wedding_host' });

    await build().use(request('app.casaria.test', '/'), response() as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it.each(['/v1/health', '/v1/public/sites/ana', '/docs', '/docs-json'])(
    'never intercepts the API route %s',
    async (path) => {
      await build().use(request('ana.casaria.test', path), response() as unknown as Response, next);

      expect(weddings.resolveHost).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    },
  );

  it('ignores methods other than GET and HEAD', async () => {
    await build().use(
      request('ana.casaria.test', '/', 'POST'),
      response() as unknown as Response,
      next,
    );

    expect(weddings.resolveHost).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('uses a minimal template without WEB_DIST_DIR (development)', async () => {
    weddings.resolveHost.mockResolvedValue({ kind: 'not_found' });
    const res = response();

    await build({ NODE_ENV: 'development', WEB_DIST_DIR: undefined }).use(
      request('x.localhost', '/'),
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sentHtml(res)).toContain('<title>CasarIA</title>');
  });

  it('refuses to start with an index.html without the meta block', () => {
    const broken = mkdtempSync(join(tmpdir(), 'casaria-web-dist-'));
    writeFileSync(join(broken, 'index.html'), '<html><head><title>x</title></head></html>');

    expect(() => build({ WEB_DIST_DIR: broken })).toThrow('site-meta');
    rmSync(broken, { recursive: true, force: true });
  });
});
