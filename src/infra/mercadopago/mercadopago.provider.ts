import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CardChargeInput,
  ConnectedAccount,
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ProviderPayment,
  ProviderTokens,
  WebhookSignatureInput,
} from '../../modules/payments/provider/payment-provider';
import {
  ProviderGrantRevoked,
  ProviderPaymentNotFound,
  ProviderRequestFailed,
} from '../../modules/payments/provider/payment-provider';
import type { Env } from '../config/env.schema';
import { apiOrigin } from '../config/public-urls';
import { centsToAmount, toProviderStatus } from './order-status';
import { verifyMercadoPagoSignature } from './webhook-signature';

const API_URL = 'https://api.mercadopago.com';
const AUTHORIZATION_URL = 'https://auth.mercadopago.com/authorization';
const TIMEOUT_MS = 10_000;

/** Caminho do retorno do OAuth na API; cadastrado como URL de redirecionamento da aplicação. */
export const OAUTH_CALLBACK_PATH = '/v1/payments/oauth/callback';

interface ApiResponse {
  status: number;
  json: Record<string, unknown> | null;
}

interface OrderJson {
  id?: unknown;
  status?: unknown;
  status_detail?: unknown;
  external_reference?: unknown;
  transactions?: {
    payments?: {
      status?: unknown;
      status_detail?: unknown;
      payment_method?: { qr_code?: unknown; qr_code_base64?: unknown };
    }[];
  };
}

interface CreatedOrder {
  order: OrderJson;
  /** Recusa que ainda trouxe a order (402): o motivo segue para o log. */
  failure: ProviderRequestFailed | null;
}

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

const isOrder = (value: unknown): value is OrderJson =>
  typeof value === 'object' && value !== null && 'id' in value && 'status' in value;

/** A order vem no corpo; na recusa (402), dentro de data, ao lado de errors. */
function readOrder(json: Record<string, unknown> | null): OrderJson | null {
  const data = json?.data;
  if (isOrder(json)) return json;
  return isOrder(data) ? data : null;
}

const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/g;
const DOCUMENT = /\d[\d.\-/]{9,}\d/g;

/**
 * Motivo da recusa para o log: códigos, mensagens e status devolvidos pelo Mercado Pago, sem
 * email nem número de documento (skill dados-pessoais §1).
 */
function failureReason(json: Record<string, unknown> | null): string | null {
  const parts: string[] = [];
  const errors = (Array.isArray(json?.errors) ? json.errors : []) as Record<string, unknown>[];
  for (const error of errors) {
    const details = Array.isArray(error?.details) ? error.details : [];
    parts.push([error?.code, error?.message, ...details].map(text).filter(Boolean).join(': '));
  }
  if (errors.length === 0 && text(json?.message)) parts.push(text(json.message));
  for (const payment of readOrder(json)?.transactions?.payments ?? []) {
    parts.push(`payment ${text(payment.status)}/${text(payment.status_detail)}`);
  }
  const reason = parts
    .filter(Boolean)
    .join(' | ')
    .replace(EMAIL, '[email]')
    .replace(DOCUMENT, '[número]');
  return reason ? reason.slice(0, 500) : null;
}

function toProviderPayment(order: OrderJson): ProviderPayment {
  const id = text(order.id);
  if (!id) throw new ProviderRequestFailed(null);
  return {
    id,
    status: toProviderStatus(text(order.status) ?? '', text(order.status_detail) ?? ''),
    externalReference: text(order.external_reference),
  };
}

/**
 * Mercado Pago com as credenciais do casal (PRD ADR-010): OAuth com PKCE, Orders API para Pix e
 * cartão e validação das notificações. Único lugar que fala com o gateway; reais só aqui.
 */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookSecret: string;
  private readonly publicKeyField: string;
  private readonly redirectUri: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('MP_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('MP_CLIENT_SECRET', { infer: true });
    this.webhookSecret = config.get('MP_WEBHOOK_SECRET', { infer: true });
    this.publicKeyField = config.get('MP_OAUTH_PUBLIC_KEY_FIELD', { infer: true });
    const origin = apiOrigin({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
      DEV_PANEL_URL: config.get('DEV_PANEL_URL', { infer: true }),
    });
    this.redirectUri = `${origin}${OAUTH_CALLBACK_PATH}`;
  }

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL(AUTHORIZATION_URL);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state,
      redirect_uri: this.redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string, codeVerifier: string): Promise<ProviderTokens> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.redirectUri,
    });
  }

  refreshTokens(refreshToken: string): Promise<ProviderTokens> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async createPixCharge(account: ConnectedAccount, input: PixChargeInput): Promise<PixCharge> {
    const amount = centsToAmount(input.totalCents);
    const { order, failure } = await this.createOrder(account, input.orderId, {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: input.orderId,
      total_amount: amount,
      payer: { email: input.payer.email, identification: { type: 'CPF', number: input.payer.cpf } },
      transactions: {
        payments: [
          {
            amount,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: `PT${input.expiresInMinutes}M`,
          },
        ],
      },
    });
    const method = order.transactions?.payments?.[0]?.payment_method;
    const qrCode = text(method?.qr_code);
    if (!qrCode) throw failure ?? new ProviderRequestFailed(null);
    return {
      ...toProviderPayment(order),
      qrCode,
      qrCodeBase64: text(method?.qr_code_base64) || null,
    };
  }

  /** A Orders API não tem campo de emissor: ele vem do token do cartão (issuerId fica sem uso). */
  async createCardCharge(
    account: ConnectedAccount,
    input: CardChargeInput,
  ): Promise<ProviderPayment> {
    const amount = centsToAmount(input.totalCents);
    const { order, failure } = await this.createOrder(account, input.orderId, {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: input.orderId,
      total_amount: amount,
      payer: { email: input.payerEmail },
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: input.paymentMethodId,
              type: 'credit_card',
              token: input.cardToken,
              installments: input.installments,
            },
          },
        ],
      },
    });
    return { ...toProviderPayment(order), failureReason: failure?.reason ?? null };
  }

  async getPayment(account: ConnectedAccount, providerPaymentId: string): Promise<ProviderPayment> {
    const response = await this.call('GET', `/v1/orders/${encodeURIComponent(providerPaymentId)}`, {
      accessToken: account.accessToken,
    });
    if (response.status === 403 || response.status === 404) throw new ProviderPaymentNotFound();
    if (response.status !== 200 || !response.json) {
      throw new ProviderRequestFailed(response.status);
    }
    return toProviderPayment(response.json as OrderJson);
  }

  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return verifyMercadoPagoSignature(this.webhookSecret, input);
  }

  /**
   * Cobrança com idempotência pelo id do pedido (RF09). Recusa volta 402 com a order: o cartão
   * recusado segue como REJECTED e o motivo vai ao log.
   */
  private async createOrder(
    account: ConnectedAccount,
    orderId: string,
    body: Record<string, unknown>,
  ): Promise<CreatedOrder> {
    const response = await this.call('POST', '/v1/orders', {
      accessToken: account.accessToken,
      idempotencyKey: orderId,
      body,
    });
    const order = readOrder(response.json);
    if ((response.status === 200 || response.status === 201) && order) {
      return { order, failure: null };
    }
    const failure = new ProviderRequestFailed(response.status, failureReason(response.json));
    if (response.status === 402 && order) return { order, failure };
    throw failure;
  }

  private async requestTokens(grant: Record<string, string>): Promise<ProviderTokens> {
    const response = await this.call('POST', '/oauth/token', {
      body: { client_id: this.clientId, client_secret: this.clientSecret, ...grant },
    });
    const json = response.json ?? {};
    if (response.status === 400 && json.error === 'invalid_grant') throw new ProviderGrantRevoked();
    const accessToken = text(json.access_token);
    const refreshToken = text(json.refresh_token);
    const expiresIn = Number(json.expires_in);
    if (response.status !== 200 || !accessToken || !refreshToken || !(expiresIn > 0)) {
      throw new ProviderRequestFailed(response.status);
    }
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      providerUserId: text(json.user_id),
      publicKey: text(json[this.publicKeyField]),
    };
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    options: { accessToken?: string; idempotencyKey?: string; body?: unknown },
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
    if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ProviderRequestFailed(null);
    }
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, json };
  }
}
