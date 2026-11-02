import { EventEmitter } from 'node:events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { of } from 'rxjs';
import type { AuditService } from './audit.service';
import { SuperadminAuditInterceptor } from './superadmin-audit.interceptor';

describe('SuperadminAuditInterceptor', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const logger = { error: jest.fn() };
  const interceptor = new SuperadminAuditInterceptor(
    audit as unknown as AuditService,
    logger as unknown as PinoLogger,
  );
  const next: CallHandler = { handle: () => of(null) };

  const run = (method: string, user: { id: string; isSuperadmin: boolean }, statusCode: number) => {
    const req = {
      method,
      user,
      route: { path: '/v1/weddings/:weddingId' },
      tenant: { weddingId: 'wedding-b', role: 'owner' },
      body: { coupleName: 'Ana & Bia' },
    };
    const res = Object.assign(new EventEmitter(), { statusCode });
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    interceptor.intercept(context, next).subscribe();
    res.emit('finish');
  };

  beforeEach(() => jest.clearAllMocks());

  it('records a PATCH of the superadmin with route, status and wedding, without the body', () => {
    run('PATCH', { id: 'user-root', isSuperadmin: true }, 200);

    expect(audit.record).toHaveBeenCalledWith({
      action: 'superadmin.request',
      actorUserId: 'user-root',
      weddingId: 'wedding-b',
      metadata: { method: 'PATCH', route: '/v1/weddings/:weddingId', statusCode: 200 },
    });
  });

  it('records a POST of the superadmin even when it fails with 4xx', () => {
    run('POST', { id: 'user-root', isSuperadmin: true }, 409);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ method: 'POST', statusCode: 409 }),
      }),
    );
  });

  it('does not record reads of the superadmin', () => {
    run('GET', { id: 'user-root', isSuperadmin: true }, 200);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not record requests of other users', () => {
    run('POST', { id: 'user-ana', isSuperadmin: false }, 201);

    expect(audit.record).not.toHaveBeenCalled();
  });
});
