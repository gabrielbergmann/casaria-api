import type { ArgumentMetadata } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { paymentsHarness, WEDDING_A } from '../../../common/testing/payments-harness';
import { CreateOrderDto } from '../dto/payments.dto';

// CPF no checkout (spec 015 RF05, RF06): o corpo passa pela mesma validação global da rota antes
// de chegar ao CheckoutService.
describe('Checkout CPF (spec 015)', () => {
  const pipe = new ZodValidationPipe();
  const metadata = { type: 'body', metatype: CreateOrderDto } as ArgumentMetadata;

  async function submit(cpf: string) {
    const h = paymentsHarness();
    h.connect();
    const gift = h.addGift();
    const input = h.orderInput(gift.id, {
      payer: { name: 'Carla Dias', email: 'carla@example.com', cpf },
    });
    const outcome = await Promise.resolve()
      .then(() => pipe.transform(input, metadata))
      .then((body) => h.checkout.createOrder(WEDDING_A, body))
      .catch((error: unknown) => ({ error }));
    return { h, outcome };
  }

  it.each(['529.982.247-24', '5299822472', '529982247250', '529.982.247-2a', '111.111.111-11'])(
    'answers 400 for %p without saving the order nor calling the payment provider (RF05)',
    async (cpf) => {
      const { h, outcome } = await submit(cpf);

      expect(outcome).toHaveProperty('error');
      expect((outcome as { error: { getStatus(): number } }).error.getStatus()).toBe(400);
      expect(
        JSON.stringify((outcome as { error: { getResponse(): unknown } }).error.getResponse()),
      ).toContain('CPF inválido.');
      expect(h.provider.pixInputs).toEqual([]);
      expect(h.db.orders).toEqual([]);
    },
  );

  it('stores only the encrypted CPF and answers the mask (RF06)', async () => {
    const { h, outcome } = await submit('529.982.247-25');

    expect(outcome).toMatchObject({ payerCpfMasked: '***.***.***-25' });
    const [order] = h.db.orders;
    expect(JSON.stringify(order)).not.toContain('52998224725');
    expect(h.crypto.decrypt(order.payerCpfEnc)).toBe('52998224725');
  });
});
