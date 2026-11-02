import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { hours } from '@nestjs/throttler';
import { ACCESS_KEY } from '../../common/auth/access.decorators';
import { PublicTenantGuard } from '../../common/tenant/public-tenant.guard';
import { GuestbookController } from './guestbook.controller';
import { PublicGuestbookController } from './public-guestbook.controller';

// Moderação é de owner e editor (PRD RF35a); quem não tem papel é negado pelo WeddingMemberGuard
// e o PATCH sem Origin do painel, pelo OriginGuard (spec 013 RNF02).
describe('Guestbook routes access', () => {
  const reflector = new Reflector();

  it.each(['list', 'moderate'] as const)('lets owner and editor into %s', (name) => {
    const handler = GuestbookController.prototype[name];

    expect(reflector.getAllAndOverride(ACCESS_KEY, [handler, GuestbookController])).toEqual({
      kind: 'roles',
      roles: ['owner', 'editor'],
    });
  });

  it('serves the site routes publicly, resolved by the slug of a published site', () => {
    expect(reflector.get(ACCESS_KEY, PublicGuestbookController)).toEqual({ kind: 'public' });
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicGuestbookController)).toEqual([
      PublicTenantGuard,
    ]);
  });

  it('limits the posts to 100 per hour per IP in the throttler (RF04)', () => {
    const handler = PublicGuestbookController.prototype.post;

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(100);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(hours(1));
  });
});
