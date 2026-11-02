import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Options } from 'pino-http';
import type { Env } from '../config/env.schema';

// Lista de redact da spec 015 (credenciais, CPF e contato, saúde), no topo do objeto logado e um
// nível abaixo. Mesmo assim, logue ids, nunca o objeto inteiro.
const SENSITIVE_FIELDS = [
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
];

export const REDACT_PATHS = [...SENSITIVE_FIELDS, ...SENSITIVE_FIELDS.map((field) => `*.${field}`)];

// Preenchidos pelos guards das specs seguintes (casamento resolvido e usuário da sessão); a rota,
// pelo roteamento do Express.
type RequestWithContext = IncomingMessage & {
  tenant?: { weddingId?: string };
  user?: { id?: string };
  route?: { path?: unknown };
  baseUrl?: string;
};

/**
 * Modelo da rota, ex.: "/v1/weddings/:weddingId/guests/:guestId". Só existe depois do roteamento:
 * entra pelo customProps, que o pino-http recalcula ao fim da requisição; fora das rotas da API
 * (estáticos, HTML do site) fica ausente.
 */
const routeTemplate = (req: RequestWithContext): string | undefined =>
  typeof req.route?.path === 'string' ? `${req.baseUrl ?? ''}${req.route.path}` : undefined;

// Só id e método da requisição (spec 015 RF08): sem URL concreta, query, cookies, headers nem IP.
const serializeRequest = (req: { id: unknown; method: string }) => ({
  id: req.id,
  method: req.method,
});

export function buildPinoHttpOptions(nodeEnv: Env['NODE_ENV']): Options {
  return {
    level: nodeEnv === 'production' ? 'info' : 'debug',
    genReqId: () => randomUUID(),
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId' },
    customProps: (req: RequestWithContext) => ({
      weddingId: req.tenant?.weddingId,
      userId: req.user?.id,
      route: routeTemplate(req),
    }),
    serializers: {
      req: serializeRequest,
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
}
