import type { ConfigService } from '@nestjs/config';
import {
  ProviderGrantRevoked,
  ProviderPaymentNotFound,
  ProviderRequestFailed,
} from '../../modules/payments/provider/payment-provider';
import type { Env } from '../config/env.schema';
import { MercadoPagoProvider } from './mercadopago.provider';

// Sem rede: o fetch global é trocado por um falso que devolve as respostas da documentação.
const env: Partial<Env> = {
  NODE_ENV: 'production',
  APP_DOMAIN: 'casaria.test',
  MP_CLIENT_ID: 'client-id',
  MP_CLIENT_SECRET: 'client-secret',
  MP_WEBHOOK_SECRET: 'webhook-secret',
  MP_OAUTH_PUBLIC_KEY_FIELD: 'public_key',
};
const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
const account = { accessToken: 'APP_USR-casal', providerUserId: '123' };
const ORDER_ID = '0199f1a1-0000-7000-8000-0000000000a1';

const reply = (status: number, json: unknown) =>
  ({ status, json: async () => json }) as unknown as Response;

describe('MercadoPagoProvider', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  const provider = new MercadoPagoProvider(config);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  const lastRequest = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return {
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
  };

  it('builds the authorization URL with PKCE S256, state and the API callback', () => {
    const url = new URL(provider.buildAuthorizationUrl('state-1', 'challenge-1'));

    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      response_type: 'code',
      platform_id: 'mp',
      state: 'state-1',
      redirect_uri: 'https://api.casaria.test/v1/payments/oauth/callback',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code with the verifier and reads the public key of the couple', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        access_token: 'APP_USR-access',
        refresh_token: 'TG-refresh',
        expires_in: 15_552_000,
        user_id: 123456,
        public_key: 'APP_USR-public',
      }),
    );

    const tokens = await provider.exchangeCode('TG-code', 'verifier-1');

    expect(lastRequest().body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'TG-code',
      code_verifier: 'verifier-1',
      client_secret: 'client-secret',
    });
    expect(tokens).toMatchObject({ providerUserId: '123456', publicKey: 'APP_USR-public' });
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 179 * 24 * 3600_000);
  });

  it('tells a refused grant apart from a transient failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_grant' }));
    await expect(provider.refreshTokens('TG-old')).rejects.toBeInstanceOf(ProviderGrantRevoked);

    fetchMock.mockResolvedValueOnce(reply(500, null));
    await expect(provider.refreshTokens('TG-old')).rejects.toBeInstanceOf(ProviderRequestFailed);

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(provider.refreshTokens('TG-old')).rejects.toBeInstanceOf(ProviderRequestFailed);
  });

  it('creates the Pix order with the couple token, the order id as idempotency key and 30 minutes', async () => {
    fetchMock.mockResolvedValue(
      reply(201, {
        id: 'ORD01',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        external_reference: ORDER_ID,
        transactions: {
          payments: [{ payment_method: { qr_code: '0002012658', qr_code_base64: 'iVBOR' } }],
        },
      }),
    );

    const charge = await provider.createPixCharge(account, {
      orderId: ORDER_ID,
      totalCents: 10_526,
      payer: { name: 'Ana', email: 'ana@example.com', cpf: '52998224725' },
      expiresInMinutes: 30,
    });

    const request = lastRequest();
    expect(request.url).toBe('https://api.mercadopago.com/v1/orders');
    expect(request.headers.Authorization).toBe('Bearer APP_USR-casal');
    expect(request.headers['X-Idempotency-Key']).toBe(ORDER_ID);
    expect(request.body).toMatchObject({
      external_reference: ORDER_ID,
      total_amount: '105.26',
      transactions: {
        payments: [
          {
            amount: '105.26',
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: 'PT30M',
          },
        ],
      },
    });
    expect(charge).toEqual({
      id: 'ORD01',
      status: 'PENDING',
      externalReference: ORDER_ID,
      qrCode: '0002012658',
      qrCodeBase64: 'iVBOR',
    });
  });

  it('sends only the card token, brand and installments, and reads a refused card (402)', async () => {
    fetchMock.mockResolvedValue(
      reply(402, {
        id: 'ORD02',
        status: 'failed',
        status_detail: 'failed',
        external_reference: ORDER_ID,
      }),
    );

    const charge = await provider.createCardCharge(account, {
      orderId: ORDER_ID,
      totalCents: 5_000,
      payerEmail: 'ana@example.com',
      cardToken: 'card-token',
      paymentMethodId: 'master',
      issuerId: '25',
      installments: 12,
    });

    expect(lastRequest().body.transactions.payments[0].payment_method).toEqual({
      id: 'master',
      type: 'credit_card',
      token: 'card-token',
      installments: 12,
    });
    expect(charge.status).toBe('REJECTED');
  });

  const refusal = (paymentDetail: string, message = 'The following transactions failed') =>
    reply(402, {
      errors: [{ code: 'failed', message, details: [`PAY01: ${paymentDetail}`] }],
      data: {
        id: 'ORD03',
        status: 'failed',
        status_detail: 'failed',
        external_reference: ORDER_ID,
        transactions: { payments: [{ status: 'failed', status_detail: paymentDetail }] },
      },
    });
  const pixInput = {
    orderId: ORDER_ID,
    totalCents: 101,
    payer: { name: 'Ana', email: 'ana@example.com', cpf: '52998224725' },
    expiresInMinutes: 30,
  };

  it('fails a refused Pix (402 with the order in data) with the reason the gateway gave', async () => {
    fetchMock.mockResolvedValue(refusal('collector_without_pix_key'));

    await expect(provider.createPixCharge(account, pixInput)).rejects.toMatchObject({
      httpStatus: 402,
      reason:
        'failed: The following transactions failed: PAY01: collector_without_pix_key' +
        ' | payment failed/collector_without_pix_key',
    });
  });

  it('keeps emails and document numbers out of the reason', async () => {
    fetchMock.mockResolvedValue(
      refusal('invalid_payer', 'payer ana@example.com 529.982.247-25 52998224725 refused'),
    );

    const failure = await provider.createPixCharge(account, pixInput).catch((err) => err);

    expect(failure).toBeInstanceOf(ProviderRequestFailed);
    expect(failure.reason).toContain('payer [email] [número] [número] refused');
    expect(failure.reason).not.toMatch(/ana@|529|52998224725/);
  });

  it('reads a refused card when the order comes in data, with the reason', async () => {
    fetchMock.mockResolvedValue(refusal('cc_rejected_insufficient_amount'));

    const charge = await provider.createCardCharge(account, {
      orderId: ORDER_ID,
      totalCents: 5_000,
      payerEmail: 'ana@example.com',
      cardToken: 'card-token',
      paymentMethodId: 'master',
      issuerId: null,
      installments: 1,
    });

    expect(charge).toMatchObject({ id: 'ORD03', status: 'REJECTED', externalReference: ORDER_ID });
    expect(charge.failureReason).toContain('cc_rejected_insufficient_amount');
  });

  it('keeps the reason of an error response without an order', async () => {
    fetchMock.mockResolvedValue(reply(400, { message: 'invalid total_amount' }));

    await expect(provider.createPixCharge(account, pixInput)).rejects.toMatchObject({
      httpStatus: 400,
      reason: 'invalid total_amount',
    });
  });

  it('reports a payment of another account as not found', async () => {
    fetchMock.mockResolvedValue(reply(404, { message: 'not found' }));

    await expect(provider.getPayment(account, 'ORD-B')).rejects.toBeInstanceOf(
      ProviderPaymentNotFound,
    );
  });
});
