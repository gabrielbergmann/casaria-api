import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { SessionUser } from '../../common/auth/session-user';
import type { Env } from '../../infra/config/env.schema';
import { SessionRequired } from './errors/session-required';
import { SessionService } from './session.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SessionService', () => {
  const config = { get: () => 'production' } as unknown as ConfigService<Env, true>;
  const service = new SessionService(config);
  const ana: SessionUser = {
    id: 'user-ana',
    email: 'ana@example.com',
    name: 'Ana',
    isSuperadmin: false,
    sessionVersion: 1,
    termsAcceptedVersion: null,
  };
  const login = new Date('2027-03-01T12:00:00Z');

  const requestWith = (session: Record<string, unknown>, user: SessionUser | undefined = ana) => {
    const destroy = jest.fn((done: (err?: unknown) => void) => done());
    const req = {
      user,
      session: { ...session, destroy },
      logIn: jest.fn((_user: unknown, done: (err?: unknown) => void) => done()),
    };
    return { req: req as unknown as Request, destroy };
  };

  afterEach(() => jest.useRealTimers());

  it('starts the session through passport and keeps only start time and version', async () => {
    jest.useFakeTimers().setSystemTime(login);
    const { req } = requestWith({});

    await service.start(req, ana);

    expect(req.logIn).toHaveBeenCalledWith(ana, expect.any(Function));
    expect(req.session.createdAt).toBe(login.getTime());
    expect(req.session.sessionVersion).toBe(1);
  });

  it('accepts a session used every 6 days until 30 days after login', async () => {
    const { req } = requestWith({ createdAt: login.getTime(), sessionVersion: 1 });
    jest.useFakeTimers();

    for (const day of [6, 12, 18, 24, 30]) {
      jest.setSystemTime(login.getTime() + day * DAY_MS);
      await expect(service.authenticate(req)).resolves.toBe(ana);
    }
  });

  it('ends a session older than 30 days even in use', async () => {
    const { req, destroy } = requestWith({ createdAt: login.getTime(), sessionVersion: 1 });
    jest.useFakeTimers().setSystemTime(login.getTime() + 30 * DAY_MS + 1);

    await expect(service.authenticate(req)).rejects.toBeInstanceOf(SessionRequired);
    expect(destroy).toHaveBeenCalled();
  });

  it('answers 401 auth.session_required without a session user (expired or logged out)', async () => {
    const { req } = requestWith({}, undefined);

    await expect(service.authenticate(req)).rejects.toMatchObject({
      status: 401,
      code: 'auth.session_required',
    });
  });

  it('rejects a session from before the last password change', async () => {
    const { req, destroy } = requestWith(
      { createdAt: Date.now(), sessionVersion: 1 },
      { ...ana, sessionVersion: 2 },
    );

    await expect(service.authenticate(req)).rejects.toBeInstanceOf(SessionRequired);
    expect(destroy).toHaveBeenCalled();
  });

  it('keeps the current session valid after a password change', async () => {
    const { req } = requestWith(
      { createdAt: Date.now(), sessionVersion: 1 },
      { ...ana, sessionVersion: 2 },
    );

    service.keepAfterPasswordChange(req, 2);

    await expect(service.authenticate(req)).resolves.toMatchObject({ id: ana.id });
  });

  it('deletes the session and expires the cookie on logout', async () => {
    const { req, destroy } = requestWith({ createdAt: Date.now(), sessionVersion: 1 });
    const res = { clearCookie: jest.fn() } as unknown as Response;

    await service.end(req, res);

    expect(destroy).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(res.clearCookie).toHaveBeenCalledWith(
      '__Host-sid',
      expect.objectContaining({ path: '/' }),
    );
  });
});
