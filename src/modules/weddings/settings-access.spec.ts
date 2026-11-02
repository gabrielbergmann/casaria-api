import { Reflector } from '@nestjs/core';
import { ACCESS_KEY } from '../../common/auth/access.decorators';
import { MembersController } from '../auth/members.controller';
import { WeddingsController } from './weddings.controller';

// Configurações (dados, acesso ao painel e exclusão) não declaram papel: o WeddingMemberGuard
// exige owner e nega o editor com 403 auth.forbidden_role (spec 005 RF12).
describe('Settings routes', () => {
  const reflector = new Reflector();
  const routes = [
    ...['get', 'update', 'delete'].map((name) => [WeddingsController, name] as const),
    ...['list', 'invite', 'cancel', 'remove'].map((name) => [MembersController, name] as const),
  ];

  it.each(routes)('%p.%s is owner only', (controller, name) => {
    const handler = (controller.prototype as unknown as Record<string, () => void>)[name];

    expect(reflector.getAllAndOverride(ACCESS_KEY, [handler, controller])).toBeUndefined();
  });
});
