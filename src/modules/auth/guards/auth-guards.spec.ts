import type { ExecutionContext } from '@nestjs/common';
import { InvalidCredentials } from '../errors/invalid-credentials';
import { GoogleAccountNotRegistered } from '../errors/google-account-not-registered';
import { GoogleAuthGuard, type GoogleCallbackRequest } from './google-auth.guard';
import { LocalLoginGuard } from './local-login.guard';

describe('LocalLoginGuard', () => {
  const guard = new LocalLoginGuard();

  it('keeps the authenticated user', () => {
    expect(guard.handleRequest(null, { id: 'user-1' })).toEqual({ id: 'user-1' });
  });

  it.each([
    ['missing credentials', null, false],
    ['a strategy error', new Error('db down'), false],
  ])('turns %s into auth.invalid_credentials', (_case, err, user) => {
    expect(() => guard.handleRequest(err, user)).toThrow(InvalidCredentials);
  });
});

describe('GoogleAuthGuard', () => {
  const guard = new GoogleAuthGuard();
  const contextFor = (req: GoogleCallbackRequest) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

  it('keeps the user of a valid callback', () => {
    expect(guard.handleRequest(null, { id: 'user-1' }, undefined, contextFor({}))).toEqual({
      id: 'user-1',
    });
  });

  it('records the domain error code to show on the login page', () => {
    const req: GoogleCallbackRequest = {};

    expect(
      guard.handleRequest(new GoogleAccountNotRegistered(), false, undefined, contextFor(req)),
    ).toBeNull();
    expect(req.googleError).toBe('auth.google_account_not_registered');
  });

  it('treats an invalid state or a denied consent as auth.google_failed', () => {
    const req: GoogleCallbackRequest = {};

    expect(
      guard.handleRequest(null, false, { message: 'Unable to verify state' }, contextFor(req)),
    ).toBeNull();
    expect(req.googleError).toBe('auth.google_failed');
  });
});
