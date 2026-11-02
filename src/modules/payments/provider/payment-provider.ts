// Fronteira com o gateway (skill pagamentos §1, PRD ADR-010): só infra/mercadopago/ fala com o
// Mercado Pago; os testes usam o FakePaymentProvider. Valores sempre em centavos aqui.

/** Status do gateway já traduzido para o do pedido (tabela de transições da spec 012). */
export type ProviderStatus =
  'PENDING' | 'IN_PROCESS' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REFUNDED' | 'CHARGED_BACK';

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** Ausentes na resposta = mantém o que já está gravado (renovação). */
  providerUserId: string | null;
  publicKey: string | null;
}

/** Conta conectada do casal: o token decifrado só para esta chamada, nunca guardado nem logado. */
export interface ConnectedAccount {
  accessToken: string;
  providerUserId: string;
}

/** Cobrança no gateway (na Orders API, a order). */
export interface ProviderPayment {
  id: string;
  /** null = status fora da tabela da spec 012: ignorado e logado. */
  status: ProviderStatus | null;
  /** Id do nosso pedido, enviado como external_reference. */
  externalReference: string | null;
  /** Motivo da recusa devolvido pelo gateway, sem dado pessoal: só para o log. */
  failureReason?: string | null;
}

export interface PixCharge extends ProviderPayment {
  /** Pix copia e cola. */
  qrCode: string;
  /** Imagem PNG do QR em base64. */
  qrCodeBase64: string | null;
}

export interface Payer {
  name: string;
  email: string;
  /** Só dígitos; vai ao gateway direto do valor da requisição (skill dados-pessoais §1). */
  cpf: string;
}

export interface PixChargeInput {
  /** Id do pedido: chave de idempotência e external_reference (RF09). */
  orderId: string;
  totalCents: number;
  payer: Payer;
  /** A expiração do Pix é a da reserva: 30 minutos. */
  expiresInMinutes: number;
}

export interface CardChargeInput {
  orderId: string;
  totalCents: number;
  payerEmail: string;
  /** Token do Brick: o cartão nunca passa pela API. */
  cardToken: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
}

export interface WebhookSignatureInput {
  /** Cabeçalho x-signature: "ts=...,v1=...". */
  signature: string | undefined;
  requestId: string | undefined;
  /** data.id da query. */
  dataId: string | undefined;
  now: Date;
}

export interface PaymentProvider {
  buildAuthorizationUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<ProviderTokens>;
  /** ProviderGrantRevoked quando o Mercado Pago recusa o refresh (conta desautorizada). */
  refreshTokens(refreshToken: string): Promise<ProviderTokens>;
  createPixCharge(account: ConnectedAccount, input: PixChargeInput): Promise<PixCharge>;
  createCardCharge(account: ConnectedAccount, input: CardChargeInput): Promise<ProviderPayment>;
  /** ProviderPaymentNotFound quando a cobrança não é da conta (ex.: outra conta). */
  getPayment(account: ConnectedAccount, providerPaymentId: string): Promise<ProviderPayment>;
  verifyWebhookSignature(input: WebhookSignatureInput): boolean;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** O Mercado Pago recusou o grant (refresh): a conta deixou de valer. */
export class ProviderGrantRevoked extends Error {
  constructor() {
    super('provider_grant_revoked');
  }
}

/** A cobrança não existe para a conta consultada. */
export class ProviderPaymentNotFound extends Error {
  constructor() {
    super('provider_payment_not_found');
  }
}

/**
 * Falha do gateway (rede, 5xx, resposta inesperada, recusa): pode ser repetida mais tarde. O
 * motivo é o que o gateway devolveu, sem dado pessoal, e vai junto ao log do erro.
 */
export class ProviderRequestFailed extends Error {
  constructor(
    readonly httpStatus: number | null,
    readonly reason: string | null = null,
  ) {
    super(`provider_request_failed:${httpStatus ?? 'network'}`);
  }
}
