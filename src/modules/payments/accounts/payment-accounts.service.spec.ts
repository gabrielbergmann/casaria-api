import {
  OWNER,
  paymentsHarness,
  WEDDING_A,
  WEDDING_B,
} from '../../../common/testing/payments-harness';
import { PaymentOAuthFailed } from '../errors/payment-errors';
import { ProviderGrantRevoked, ProviderRequestFailed } from '../provider/payment-provider';
import type { OAuthSession } from './oauth-session';

const DAY = 24 * 3600_000;

describe('PaymentAccountsService', () => {
  describe('OAuth (RF01, RF02)', () => {
    const start = () => {
      const h = paymentsHarness();
      const session: OAuthSession = {};
      const url = new URL(h.accounts.startConnection(session, WEDDING_A, OWNER.id));
      return { h, session, state: url.searchParams.get('state'), url };
    };

    it('starts with PKCE S256 and a single-use state tied to the wedding and the user', () => {
      const { session, state, url } = start();

      expect(session.mpOAuth).toMatchObject({ state, weddingId: WEDDING_A, userId: OWNER.id });
      expect(url.searchParams.get('code_challenge')).not.toBe(session.mpOAuth.codeVerifier);
      expect(state.startsWith(`${WEDDING_A}.`)).toBe(true);
    });

    it('connects with the tokens only encrypted and audits (RF01)', async () => {
      const { h, session, state } = start();

      await expect(h.accounts.completeConnection(session, OWNER, 'TG-code', state)).resolves.toBe(
        WEDDING_A,
      );

      const [account] = h.db.accounts;
      expect(account).toMatchObject({
        weddingId: WEDDING_A,
        status: 'CONNECTED',
        providerUserId: 'mp-user-a',
        publicKey: 'APP_USR-public-a',
        expiresAt: h.provider.tokens.expiresAt,
      });
      expect(account.accessTokenEnc).not.toContain('APP_USR-access');
      expect(h.crypto.decrypt(account.accessTokenEnc)).toBe('APP_USR-access');
      expect(h.crypto.decrypt(account.refreshTokenEnc)).toBe('TG-refresh');
      expect(session.mpOAuth).toBeUndefined();
      expect(h.audit.record).toHaveBeenCalledWith({
        action: 'payments.account_connected',
        actorUserId: OWNER.id,
        weddingId: WEDDING_A,
        metadata: {},
      });
      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({ pix: true, card: true });
    });

    it('refuses an expired state and keeps the account as it was (RF02)', async () => {
      const { h, session, state } = start();
      h.advance(10 * 60_000 + 1);

      await expect(
        h.accounts.completeConnection(session, OWNER, 'TG-code', state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      expect(h.db.accounts).toHaveLength(0);
    });

    it('refuses a reused state (RF02)', async () => {
      const { h, session, state } = start();
      await h.accounts.completeConnection(session, OWNER, 'TG-code', state);
      h.db.accounts.length = 0;

      await expect(
        h.accounts.completeConnection(session, OWNER, 'TG-code', state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      expect(h.db.accounts).toHaveLength(0);
    });

    it('refuses a state of another user or a forged one (RF02)', async () => {
      const { h, session, state } = start();
      const other = { id: 'user-other', isSuperadmin: false };

      await expect(
        h.accounts.completeConnection(session, other, 'TG-code', state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      const again = start();
      await expect(
        again.h.accounts.completeConnection(
          again.session,
          OWNER,
          'TG-code',
          `${WEDDING_A}.forjado`,
        ),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      expect(h.db.accounts).toHaveLength(0);
    });

    it('refuses when the user is no longer owner, and when the code exchange fails (RF02)', async () => {
      const first = start();
      first.h.members.findRole.mockResolvedValueOnce('editor');
      await expect(
        first.h.accounts.completeConnection(first.session, OWNER, 'TG-code', first.state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);

      const second = start();
      second.h.provider.exchangeError = new ProviderRequestFailed(400);
      await expect(
        second.h.accounts.completeConnection(second.session, OWNER, 'TG-code', second.state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      expect(second.h.db.accounts).toHaveLength(0);
    });

    it('refuses tokens without the public key of the couple', async () => {
      const { h, session, state } = start();
      h.provider.tokens = { ...h.provider.tokens, publicKey: null };

      await expect(
        h.accounts.completeConnection(session, OWNER, 'TG-code', state),
      ).rejects.toBeInstanceOf(PaymentOAuthFailed);
      expect(h.db.accounts).toHaveLength(0);
    });
  });

  describe('disconnection (RF03, RF04)', () => {
    it('erases the tokens when the owner disconnects, blocks checkout and audits', async () => {
      const h = paymentsHarness();
      h.connect();

      await h.accounts.disconnectByOwner(WEDDING_A, OWNER.id);

      expect(h.db.accounts[0]).toMatchObject({
        status: 'DISCONNECTED',
        disconnectReason: 'OWNER',
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
        disconnectedAt: h.now(),
      });
      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({
        pix: false,
        card: false,
      });
      await expect(h.accounts.getStatus(WEDDING_A)).resolves.toMatchObject({
        status: 'DISCONNECTED',
        disconnectReason: 'OWNER',
      });
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payments.account_disconnected',
          metadata: { reason: 'OWNER' },
        }),
      );
    });

    it('reports a wedding that never connected', async () => {
      const h = paymentsHarness();

      await expect(h.accounts.getStatus(WEDDING_A)).resolves.toMatchObject({
        status: 'NOT_CONNECTED',
      });
    });

    it('disconnects on a deauthorization confirmed by Mercado Pago', async () => {
      const h = paymentsHarness();
      h.connect(WEDDING_A);
      h.connect(WEDDING_B);
      h.provider.refreshError = new ProviderGrantRevoked();

      await h.accounts.handleDeauthorization('mp-user-a');

      expect(h.db.accounts[0]).toMatchObject({
        status: 'DISCONNECTED',
        disconnectReason: 'DEAUTHORIZED',
        accessTokenEnc: null,
      });
      expect(h.db.accounts[1].status).toBe('CONNECTED');
    });

    it('changes nothing when Mercado Pago does not confirm the deauthorization', async () => {
      const h = paymentsHarness();
      h.connect();

      await h.accounts.handleDeauthorization('mp-user-a');

      expect(h.db.accounts[0]).toMatchObject({ status: 'CONNECTED', disconnectReason: null });
      await expect(h.checkout.availability(WEDDING_A)).resolves.toEqual({ pix: true, card: true });
    });

    it('lets Mercado Pago retry when the confirmation fails for a transient reason', async () => {
      const h = paymentsHarness();
      h.connect();
      h.provider.refreshError = new ProviderRequestFailed(503);

      await expect(h.accounts.handleDeauthorization('mp-user-a')).rejects.toBeInstanceOf(
        ProviderRequestFailed,
      );
      expect(h.db.accounts[0].status).toBe('CONNECTED');
    });
  });

  describe('renewal (RF13)', () => {
    it('renews the account that expires in 30 days and not the one in 31', async () => {
      const h = paymentsHarness();
      const in30 = h.connect(WEDDING_A, { expiresAt: new Date(h.now().getTime() + 30 * DAY) });
      const in31 = h.connect(WEDDING_B, { expiresAt: new Date(h.now().getTime() + 31 * DAY) });
      const before31 = in31.accessTokenEnc;

      await h.accounts.renewIfDue(WEDDING_A);
      await h.accounts.renewIfDue(WEDDING_B);

      expect(h.provider.refreshedWith).toEqual([`TG-refresh-${WEDDING_A}`]);
      expect(h.crypto.decrypt(in30.accessTokenEnc)).toBe('APP_USR-access-1');
      expect(in30.expiresAt).toEqual(h.provider.tokens.expiresAt);
      expect(in31.accessTokenEnc).toBe(before31);
    });

    it('disconnects when the refresh is refused', async () => {
      const h = paymentsHarness();
      h.connect(WEDDING_A, { expiresAt: new Date(h.now().getTime() + 5 * DAY) });
      h.provider.refreshError = new ProviderGrantRevoked();

      await h.accounts.renewIfDue(WEDDING_A);

      expect(h.db.accounts[0]).toMatchObject({
        status: 'DISCONNECTED',
        disconnectReason: 'REFRESH_FAILED',
        refreshTokenEnc: null,
      });
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: null, metadata: { reason: 'REFRESH_FAILED' } }),
      );
    });

    it('retries tomorrow on a transient failure while the token is valid, and disconnects once expired', async () => {
      const h = paymentsHarness();
      h.connect(WEDDING_A, { expiresAt: new Date(h.now().getTime() + DAY) });
      h.provider.refreshError = new ProviderRequestFailed(503);

      await h.accounts.renewIfDue(WEDDING_A);
      expect(h.db.accounts[0].status).toBe('CONNECTED');

      h.advance(2 * DAY);
      await h.accounts.renewIfDue(WEDDING_A);
      expect(h.db.accounts[0]).toMatchObject({
        status: 'DISCONNECTED',
        disconnectReason: 'REFRESH_FAILED',
      });
    });

    it('keeps the tokens another instance already renewed', async () => {
      const h = paymentsHarness();
      const account = h.connect(WEDDING_A, { expiresAt: new Date(h.now().getTime() + DAY) });
      h.provider.refreshError = new ProviderGrantRevoked();
      h.accountsRepo.find.mockImplementationOnce(async () => {
        const snapshot = { ...account };
        account.refreshTokenEnc = h.crypto.encrypt('TG-renewed-elsewhere');
        return snapshot;
      });

      await h.accounts.renewIfDue(WEDDING_A);

      expect(account.status).toBe('CONNECTED');
      expect(h.crypto.decrypt(account.refreshTokenEnc)).toBe('TG-renewed-elsewhere');
    });
  });
});
