import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { SessionService } from './session.service';

describe('AuthController', () => {
  const auth = {
    panelUrl: jest.fn((path: string) => `https://app.casaria.test${path}`),
    changePassword: jest.fn(),
  };
  const sessions = { start: jest.fn(), keepAfterPasswordChange: jest.fn(), end: jest.fn() };
  const controller = new AuthController(
    auth as unknown as AuthService,
    sessions as unknown as SessionService,
  );
  const res = { redirect: jest.fn() } as unknown as Response;
  const ana = { id: 'user-ana', isSuperadmin: false, sessionVersion: 1 };

  beforeEach(() => jest.clearAllMocks());

  it('starts the session after a successful login', async () => {
    const req = { user: ana } as unknown as Request;

    await controller.login(req, { email: 'ana@example.com', password: 'x' });

    expect(sessions.start).toHaveBeenCalledWith(req, ana);
  });

  it('starts the session and opens the panel after the Google callback', async () => {
    const req = { user: ana } as unknown as Request;

    await controller.googleCallback(req, res);

    expect(sessions.start).toHaveBeenCalledWith(req, ana);
    expect(res.redirect).toHaveBeenCalledWith('https://app.casaria.test/');
  });

  it('goes back to the login with the error and without a session when Google fails', async () => {
    const req = {
      user: null,
      googleError: 'auth.google_account_not_registered',
    } as unknown as Request;

    await controller.googleCallback(req, res);

    expect(sessions.start).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.casaria.test/login?error=auth.google_account_not_registered',
    );
  });

  it('keeps the current session with the new version after a password change', async () => {
    auth.changePassword.mockResolvedValue(5);
    const req = { user: ana } as unknown as Request;

    await controller.changePassword(req, {
      currentPassword: 'atual-12345',
      newPassword: 'nova-123456',
    });

    expect(auth.changePassword).toHaveBeenCalledWith(ana.id, 'atual-12345', 'nova-123456');
    expect(sessions.keepAfterPasswordChange).toHaveBeenCalledWith(req, 5);
  });
});
