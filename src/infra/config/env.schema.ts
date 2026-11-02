import { z } from 'zod';

// Mensagem por variável sem nunca ecoar o valor recebido (RF03).
const message = (invalid: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? 'obrigatória' : invalid),
});

const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(
      ['development', 'production', 'test'],
      message('deve ser development, production ou test'),
    ),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_DOMAIN: z
      .string(message('deve ser um hostname'))
      .regex(HOSTNAME, { error: 'deve ser um hostname, sem esquema nem porta' }),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      ...message('deve ser uma URL postgresql://'),
    }),
    REDIS_URL: z.url({ protocol: /^rediss?$/, ...message('deve ser uma URL redis://') }),
    // Chave única do AES-256-GCM (ADR-009 do PRD).
    ENCRYPTION_KEY: z
      .base64(message('deve ser base64'))
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        error: 'deve ter 32 bytes em base64',
      }),
    // Sessão e login com Google (spec 004).
    SESSION_SECRET: z
      .string(message('deve ser texto'))
      .min(32, { error: 'deve ter 32 caracteres ou mais' }),
    GOOGLE_CLIENT_ID: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    GOOGLE_CLIENT_SECRET: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    // Storage compatível com S3 das imagens (spec 006). Leitura pública só das versões.
    S3_ENDPOINT: z.url({ protocol: /^https?$/, ...message('deve ser uma URL http(s)://') }),
    S3_REGION: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    S3_BUCKET: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    S3_ACCESS_KEY_ID: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    S3_SECRET_ACCESS_KEY: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    S3_FORCE_PATH_STYLE: z.stringbool(message('deve ser true ou false')).default(false),
    // URL http(s) das imagens. Só em desenvolvimento pode ser um caminho (/storage/<bucket>), que
    // o navegador resolve na própria página e o Vite repassa ao storage local (funciona no túnel).
    S3_PUBLIC_BASE_URL: z
      .string(message('deve ser uma URL http(s):// ou um caminho /'))
      .regex(/^(https?:\/\/[^\s]+|\/[^\s]*)$/, {
        error: 'deve ser uma URL http(s):// ou um caminho /',
      })
      .transform((value) => value.replace(/\/+$/, '')),
    // Aplicação do Mercado Pago (spec 012): OAuth por casal e chave das notificações. A public key
    // é de cada casal; o campo da resposta do OAuth que a traz é configurável (padrão documentado).
    MP_CLIENT_ID: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    MP_CLIENT_SECRET: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    MP_WEBHOOK_SECRET: z.string(message('deve ser texto')).min(1, { error: 'obrigatória' }),
    MP_OAUTH_PUBLIC_KEY_FIELD: z
      .string(message('deve ser texto'))
      .regex(/^[a-z_]+$/, { error: 'deve ser o nome de um campo, ex.: public_key' })
      .default('public_key'),
    // Pasta do build do web servida nos subdomínios dos casamentos (spec 007, ADR-003 do PRD).
    // Obrigatória só em produção: no desenvolvimento o site roda no Vite.
    WEB_DIST_DIR: z.string(message('deve ser um caminho')).min(1).optional(),
    // Só em desenvolvimento: endereço https público (ex.: túnel do ngrok) que abre o painel, para
    // o OAuth do Google e do Mercado Pago voltar a ele. Ignorada fora de development.
    DEV_PANEL_URL: z
      .url({ protocol: /^https$/, ...message('deve ser uma URL https://') })
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.WEB_DIST_DIR) {
      ctx.addIssue({ code: 'custom', path: ['WEB_DIST_DIR'], message: 'obrigatória em produção' });
    }
    if (env.NODE_ENV !== 'development' && env.S3_PUBLIC_BASE_URL.startsWith('/')) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_PUBLIC_BASE_URL'],
        message: 'caminho relativo só em desenvolvimento; use uma URL http(s)://',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const causes = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis de ambiente inválidas: ${causes.join('; ')}`);
}
