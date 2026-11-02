import { CardPaymentSchema, CreateOrderSchema, PaymentFeesSchema } from './payments.dto';

const order = (overrides: Record<string, unknown> = {}) => ({
  giftId: '01890000-0000-7000-8000-0000000000a1',
  method: 'PIX',
  payer: { name: 'Carla Dias', email: 'carla@example.com', cpf: '529.982.247-25' },
  ...overrides,
});

describe('CreateOrderSchema', () => {
  it('keeps only the CPF digits and drops a price sent by the site (RF06)', () => {
    const parsed = CreateOrderSchema.parse(order({ priceCents: 1, totalCents: 1 }));

    expect(parsed.payer.cpf).toBe('52998224725');
    expect(parsed).not.toHaveProperty('priceCents');
    expect(parsed).not.toHaveProperty('totalCents');
    expect(parsed.isAnonymous).toBe(false);
  });

  it('refuses an invalid CPF before anything is created (RF07)', () => {
    const result = CreateOrderSchema.safeParse(
      order({ payer: { name: 'Carla', email: 'carla@example.com', cpf: '111.111.111-11' } }),
    );

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['payer', 'cpf']);
  });

  it('accepts a message of up to 1,000 characters', () => {
    expect(CreateOrderSchema.safeParse(order({ message: 'a'.repeat(1000) })).success).toBe(true);
    expect(CreateOrderSchema.safeParse(order({ message: 'a'.repeat(1001) })).success).toBe(false);
  });
});

describe('CardPaymentSchema (RF09)', () => {
  const card = { cardToken: 'tok', paymentMethodId: 'master', issuerId: '25', installments: 12 };

  it('accepts 1 to 12 installments only', () => {
    expect(CardPaymentSchema.safeParse({ ...card, installments: 1 }).success).toBe(true);
    expect(CardPaymentSchema.safeParse(card).success).toBe(true);
    expect(CardPaymentSchema.safeParse({ ...card, installments: 0 }).success).toBe(false);
    expect(CardPaymentSchema.safeParse({ ...card, installments: 13 }).success).toBe(false);
  });

  it.each(['cardNumber', 'securityCode', 'expirationDate'])('refuses card data (%s)', (key) => {
    expect(CardPaymentSchema.safeParse({ ...card, [key]: '4111' }).success).toBe(false);
  });
});

describe('PaymentFeesSchema', () => {
  it('takes whole numbers and leaves the range to payment.invalid_fee', () => {
    const fee = { percentBps: 10_000, fixedCents: -1 };

    expect(PaymentFeesSchema.safeParse({ pix: fee, card: fee }).success).toBe(true);
    expect(
      PaymentFeesSchema.safeParse({ pix: { percentBps: 4.99, fixedCents: 0 }, card: fee }).success,
    ).toBe(false);
  });
});
