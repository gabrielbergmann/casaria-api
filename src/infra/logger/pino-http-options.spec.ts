import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import { buildPinoHttpOptions } from './pino-http-options';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(nodeEnv: 'development' | 'production') {
  const lines: Record<string, any>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  const middleware = pinoHttp(buildPinoHttpOptions(nodeEnv), stream);
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/v1/auth/google/callback?code=abc&state=st4te',
    headers: { cookie: 'sid=s3cr3t', authorization: 'Bearer t0k3n', host: 'api.casaria.test' },
    socket: { remoteAddress: '203.0.113.7' },
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: true,
    getHeaders: () => ({ 'set-cookie': 'sid=s3cr3t' }),
  });
  middleware(req as any, res as any);
  // O Express grava o modelo da rota depois do middleware de log, no roteamento.
  Object.assign(req, { route: { path: '/v1/auth/google/callback' }, baseUrl: '' });
  return { lines, req: req as any, res };
}

describe('buildPinoHttpOptions', () => {
  it('redacts personal data, secrets and auth headers', () => {
    const { lines, req, res } = setup('production');

    req.log.info(
      {
        email: 'ana@example.com',
        cpf: '12345678909',
        password: 'a-long-password',
        accessToken: 'APP_USR-token',
        payer: { email: 'bia@example.com', cpf: '98765432100' },
      },
      'payload',
    );
    res.emit('finish');

    const [payload, completed] = lines;
    expect(payload).toMatchObject({
      email: '[REDACTED]',
      cpf: '[REDACTED]',
      password: '[REDACTED]',
      accessToken: '[REDACTED]',
      payer: { email: '[REDACTED]', cpf: '[REDACTED]' },
    });
    expect(JSON.stringify(lines)).not.toMatch(/s3cr3t|t0k3n|example\.com|12345678909/);
  });

  // Tabela de redact da spec 015 (RF08): cada caminho, no topo e um nível abaixo.
  it.each([
    'password',
    'currentPassword',
    'newPassword',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'cardToken',
    'cpf',
    'payerCpf',
    'cpfEnc',
    'phone',
    'email',
    'payerEmail',
    'dietaryNotes',
  ])('redacts %s (spec 015 RF08)', (field) => {
    const { lines, req } = setup('production');

    req.log.info({ [field]: 'secret-value', nested: { [field]: 'secret-value' } }, 'payload');

    expect(lines[0][field]).toBe('[REDACTED]');
    expect(lines[0].nested[field]).toBe('[REDACTED]');
  });

  it('tags every log with a UUID requestId', () => {
    const { lines, req, res } = setup('production');

    req.log.info('inside request');
    res.emit('finish');

    expect(lines).toHaveLength(2);
    expect(lines[0].requestId).toMatch(UUID);
    expect(lines[1].requestId).toBe(lines[0].requestId);
  });

  it('logs the Google callback only with id, method, route model and status (spec 015 RF08)', () => {
    const { lines, res } = setup('production');

    res.emit('finish');

    expect(lines[0].req).toEqual({ id: lines[0].requestId, method: 'GET' });
    expect(lines[0].route).toBe('/v1/auth/google/callback');
    expect(lines[0].res).toEqual({ statusCode: 200 });
    expect(JSON.stringify(lines)).not.toMatch(/code|abc|state|st4te|cookie|sid=|203\.0\.113/);
  });

  it('logs the route model, never the concrete path with ids', () => {
    const { lines, req, res } = setup('production');

    req.url = '/v1/weddings/0199f1a1-0000-7000-8000-000000000001/guests/abc';
    req.route = { path: '/v1/weddings/:weddingId/guests/:guestId' };
    res.emit('finish');

    expect(lines[0].route).toBe('/v1/weddings/:weddingId/guests/:guestId');
    expect(JSON.stringify(lines)).not.toContain('0199f1a1');
  });

  it('adds weddingId and userId once the request knows them', () => {
    const { lines, req, res } = setup('production');

    req.tenant = { weddingId: 'wedding-a' };
    req.user = { id: 'user-1' };
    res.emit('finish');

    expect(lines[0]).toMatchObject({ weddingId: 'wedding-a', userId: 'user-1' });
  });

  it('drops debug logs in production and keeps them elsewhere', () => {
    const production = setup('production');
    const development = setup('development');

    production.req.log.debug('hidden');
    development.req.log.debug('visible');

    expect(production.lines).toHaveLength(0);
    expect(development.lines).toHaveLength(1);
  });
});
