import type {
  CardChargeInput,
  ConnectedAccount,
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ProviderPayment,
  ProviderStatus,
  ProviderTokens,
  WebhookSignatureInput,
} from '../../modules/payments/provider/payment-provider';
import { ProviderPaymentNotFound } from '../../modules/payments/provider/payment-provider';

interface FakeCharge {
  providerUserId: string;
  externalReference: string;
  status: ProviderStatus;
}

/**
 * Mercado Pago falso dos testes (spec 012 RNF03): nenhuma chamada real. Guarda as cobranças por
 * id, é idempotente pelo id do pedido e deixa o teste mudar o status "no gateway".
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly charges = new Map<string, FakeCharge>();
  readonly pixInputs: PixChargeInput[] = [];
  readonly cardInputs: CardChargeInput[] = [];
  readonly refreshedWith: string[] = [];
  tokens: ProviderTokens = {
    accessToken: 'APP_USR-access',
    refreshToken: 'TG-refresh',
    expiresAt: new Date('2027-09-01T00:00:00.000Z'),
    providerUserId: 'mp-user-a',
    publicKey: 'APP_USR-public-a',
  };
  exchangeError: Error | null = null;
  refreshError: Error | null = null;
  chargeError: Error | null = null;
  getPaymentError: Error | null = null;
  pixStatus: ProviderStatus = 'PENDING';
  cardStatus: ProviderStatus = 'APPROVED';
  cardFailureReason: string | null = null;
  validSignature = true;
  private renewals = 0;

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    return `https://auth.fake/authorization?state=${state}&code_challenge=${codeChallenge}`;
  }

  async exchangeCode(): Promise<ProviderTokens> {
    if (this.exchangeError) throw this.exchangeError;
    return { ...this.tokens };
  }

  async refreshTokens(refreshToken: string): Promise<ProviderTokens> {
    this.refreshedWith.push(refreshToken);
    if (this.refreshError) throw this.refreshError;
    this.renewals += 1;
    return {
      ...this.tokens,
      accessToken: `APP_USR-access-${this.renewals}`,
      refreshToken: `TG-refresh-${this.renewals}`,
    };
  }

  async createPixCharge(account: ConnectedAccount, input: PixChargeInput): Promise<PixCharge> {
    this.pixInputs.push(input);
    const charge = this.charge(account, input.orderId, this.pixStatus);
    return { ...charge, qrCode: `00020126-${input.orderId}`, qrCodeBase64: 'iVBORw0KGgo=' };
  }

  async createCardCharge(
    account: ConnectedAccount,
    input: CardChargeInput,
  ): Promise<ProviderPayment> {
    this.cardInputs.push(input);
    const charge = this.charge(account, input.orderId, this.cardStatus);
    return { ...charge, failureReason: this.cardFailureReason };
  }

  async getPayment(account: ConnectedAccount, providerPaymentId: string): Promise<ProviderPayment> {
    if (this.getPaymentError) throw this.getPaymentError;
    const charge = this.charges.get(providerPaymentId);
    if (!charge || charge.providerUserId !== account.providerUserId) {
      throw new ProviderPaymentNotFound();
    }
    return {
      id: providerPaymentId,
      status: charge.status,
      externalReference: charge.externalReference,
    };
  }

  verifyWebhookSignature(_input: WebhookSignatureInput): boolean {
    return this.validSignature;
  }

  /** Cobrança criada por fora (outra conta), para os testes de isolamento. */
  addCharge(id: string, charge: FakeCharge): void {
    this.charges.set(id, charge);
  }

  /** O que acontece no Mercado Pago: Pix pago, estorno, contestação. */
  setRemoteStatus(providerPaymentId: string, status: ProviderStatus): void {
    const charge = this.charges.get(providerPaymentId);
    if (charge) charge.status = status;
  }

  /** Mesma chave de idempotência (o id do pedido) = a mesma cobrança. */
  private charge(account: ConnectedAccount, orderId: string, status: ProviderStatus) {
    if (this.chargeError) throw this.chargeError;
    const id = `ORD-${orderId}`;
    if (!this.charges.has(id)) {
      this.charges.set(id, {
        providerUserId: account.providerUserId,
        externalReference: orderId,
        status,
      });
    }
    const charge = this.charges.get(id);
    return { id, status: charge.status, externalReference: charge.externalReference };
  }
}
