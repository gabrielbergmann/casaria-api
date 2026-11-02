import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { ACCESS_KEY } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { PaymentAccountController } from './payment-account.controller';
import { PaymentFeesController } from './payment-fees.controller';
import { PaymentOAuthController } from './payment-oauth.controller';
import { PixKeyController } from './pix-key.controller';
import { PublicCheckoutController } from './public-checkout.controller';
import { ReceivedGiftsController } from './received-gifts.controller';
import { WebhooksController } from './webhooks.controller';

// O Reflector pede o construtor do controller.
type Controller = abstract new (...args: never[]) => object;

const handlers = (controller: Controller) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [controller, name] as const);

const handler = (controller: Controller, name: string) =>
  (controller.prototype as unknown as Record<string, () => void>)[name];

// Financeiro, conexão e taxas são do owner (PRD RF38): sem declaração, o WeddingMemberGuard
// exige owner e devolve 403 auth.forbidden_role ao editor (spec 012 RF01, RF14), exceto a lista
// reduzida e o agradecido da spec 014.
describe('Payment routes access', () => {
  const reflector = new Reflector();

  it.each([
    ...handlers(PaymentAccountController),
    ...handlers(PaymentFeesController),
    ...handlers(PixKeyController),
    [ReceivedGiftsController, 'list'] as const,
    [ReceivedGiftsController, 'listAwaiting'] as const,
    [ReceivedGiftsController, 'confirm'] as const,
    [ReceivedGiftsController, 'markNotReceived'] as const,
  ])('%p.%s is owner only', (controller, name) => {
    expect(
      reflector.getAllAndOverride(ACCESS_KEY, [handler(controller, name), controller]),
    ).toBeUndefined();
  });

  // Lista reduzida e agradecido (spec 014 RF07, RF09): owner e editor.
  it.each(['summary', 'markThanked', 'unmarkThanked'])(
    'ReceivedGiftsController.%s lets owner and editor in',
    (name) => {
      expect(
        reflector.getAllAndOverride(ACCESS_KEY, [
          handler(ReceivedGiftsController, name),
          ReceivedGiftsController,
        ]),
      ).toEqual({ kind: 'roles', roles: ['owner', 'editor'] });
    },
  );

  it('serves the checkout publicly, by the slug of a published site', () => {
    expect(reflector.get(ACCESS_KEY, PublicCheckoutController)).toEqual({ kind: 'public' });
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicCheckoutController)).toEqual([
      PublicTenantGuard,
    ]);
  });

  it('limits orders, card submissions and "Já fiz o Pix" to 10 every 10 minutes per IP (RNF01)', () => {
    for (const name of ['createOrder', 'payWithCard', 'declarePixSent']) {
      expect(
        Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler(PublicCheckoutController, name)),
      ).toBe(10);
    }
  });

  it('takes the OAuth return only with a session and the webhook without one', () => {
    expect(reflector.get(ACCESS_KEY, PaymentOAuthController)).toEqual({ kind: 'authenticated' });
    expect(reflector.get(ACCESS_KEY, WebhooksController)).toEqual({ kind: 'public' });
  });
});
