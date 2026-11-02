import type { Request, Response } from 'express';
import { fakeLogger } from '../../common/testing/payments-harness';
import type { AuthService } from '../auth/auth.service';
import type { PaymentAccountsService } from './accounts/payment-accounts.service';
import { PaymentOAuthFailed } from './errors/payment-errors';
import { PaymentOAuthController } from './payment-oauth.controller';

const WEDDING = '01890000-0000-7000-8000-00000000000a';

describe('PaymentOAuthController', () => {
  const accounts = { completeConnection: jest.fn() };
  const auth = { panelUrl: (path: string) => `https://app.casaria.test${path}` };
  const controller = new PaymentOAuthController(
    accounts as unknown as PaymentAccountsService,
    auth as unknown as AuthService,
    fakeLogger(),
  );
  const req = { session: {}, user: { id: 'owner' } } as unknown as Request;
  const res = () => ({ redirect: jest.fn() }) as unknown as Response & { redirect: jest.Mock };

  it('goes back to Settings after connecting', async () => {
    accounts.completeConnection.mockResolvedValueOnce(WEDDING);
    const response = res();

    await controller.callback(req, response, 'TG-code', `${WEDDING}.abc`);

    expect(response.redirect).toHaveBeenCalledWith(
      `https://app.casaria.test/weddings/${WEDDING}/settings?mp=connected`,
    );
  });

  it('shows payment.oauth_failed in the Settings of the wedding of the state (RF02)', async () => {
    accounts.completeConnection.mockRejectedValueOnce(new PaymentOAuthFailed());
    const response = res();

    await controller.callback(req, response, 'TG-code', `${WEDDING}.reusado`);

    expect(response.redirect).toHaveBeenCalledWith(
      `https://app.casaria.test/weddings/${WEDDING}/settings?mp_error=payment.oauth_failed`,
    );
  });

  it('falls back to the panel home with a forged state', async () => {
    accounts.completeConnection.mockRejectedValueOnce(new PaymentOAuthFailed());
    const response = res();

    await controller.callback(req, response, undefined, '../../evil');

    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.casaria.test/?mp_error=payment.oauth_failed',
    );
  });
});
