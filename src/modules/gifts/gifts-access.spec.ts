import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { GiftCategoriesController } from './gift-categories.controller';
import { GiftsController } from './gifts.controller';
import { PublicGiftsController } from './public-gifts.controller';

// O catálogo é conteúdo (PRD RF38): owner e editor em todas as rotas; quem não tem papel no
// casamento é negado pelo WeddingMemberGuard (spec 011 RF03).
describe('Gift routes access', () => {
  const reflector = new Reflector();
  const handlers = (controller: typeof GiftsController | typeof GiftCategoriesController) =>
    Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => [controller, name] as const);

  it.each([...handlers(GiftsController), ...handlers(GiftCategoriesController)])(
    '%p.%s lets owner and editor in',
    (controller, name) => {
      const handler = (controller.prototype as unknown as Record<string, () => void>)[name];

      expect(reflector.getAllAndOverride(ACCESS_KEY, [handler, controller])).toEqual({
        kind: 'roles',
        roles: ['owner', 'editor'],
      });
    },
  );

  it('serves the showcase publicly, resolved by the slug of a published site', () => {
    expect(reflector.get(ACCESS_KEY, PublicGiftsController)).toEqual({ kind: 'public' });
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicGiftsController)).toEqual([
      PublicTenantGuard,
    ]);
  });
});
