import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { PinoLogger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { DomainError } from '../errors/domain-error';
import { ProblemDetailsFilter } from './problem-details.filter';

class GiftSoldOut extends DomainError {
  readonly code = 'gift.sold_out';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Presente esgotado.';
}

describe('ProblemDetailsFilter', () => {
  const logger = { error: jest.fn() };
  const response = { status: jest.fn(), type: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const filter = new ProblemDetailsFilter(logger as unknown as PinoLogger);

  beforeEach(() => {
    jest.resetAllMocks();
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
  });

  const handle = (exception: unknown) => {
    filter.catch(exception, host);
    return response.json.mock.calls[0][0];
  };

  it('answers application/problem+json', () => {
    handle(new GiftSoldOut());

    expect(response.type).toHaveBeenCalledWith('application/problem+json');
  });

  it('sets the headers of a domain error, such as Retry-After', () => {
    class Blocked extends DomainError {
      readonly code = 'invitation.code_blocked';
      readonly status = HttpStatus.TOO_MANY_REQUESTS;
      readonly title = 'Muitas tentativas.';
      override get headers() {
        return { 'Retry-After': '3600' };
      }
    }

    handle(new Blocked());

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '3600');
    expect(response.status).toHaveBeenCalledWith(429);
  });

  it('keeps the status and code of a domain error', () => {
    const body = handle(new GiftSoldOut());

    expect(response.status).toHaveBeenCalledWith(409);
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Presente esgotado.',
      status: 409,
      code: 'gift.sold_out',
    });
  });

  it('adds the extension members of a domain error without overriding the standard ones', () => {
    class ImageInUse extends DomainError {
      readonly code = 'media.in_use';
      readonly status = HttpStatus.CONFLICT;
      readonly title = 'Em uso.';
      override get extensions() {
        return { usedIn: ['site'], status: 200 };
      }
    }

    const body = handle(new ImageInUse());

    expect(body).toEqual({
      type: 'about:blank',
      title: 'Em uso.',
      status: 409,
      code: 'media.in_use',
      usedIn: ['site'],
    });
  });

  it('maps an invalid Zod body to common.validation_failed with the path', () => {
    const schema = z.object({ guest: z.object({ name: z.string() }) });
    const { error } = schema.safeParse({ guest: {} });

    const body = handle(new ZodValidationException(error));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(body.code).toBe('common.validation_failed');
    expect(body.errors).toEqual([{ path: 'guest.name', message: expect.any(String) }]);
  });

  it('maps a missing route to common.not_found', () => {
    const body = handle(new NotFoundException('Cannot GET /v1/missing'));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(body.code).toBe('common.not_found');
  });

  it('maps the throttler to common.rate_limited', () => {
    const body = handle(new ThrottlerException());

    expect(response.status).toHaveBeenCalledWith(429);
    expect(body.code).toBe('common.rate_limited');
  });

  it('maps another Nest HttpException to common.http_error with its status', () => {
    const body = handle(new BadRequestException('Unexpected token in JSON'));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(body.code).toBe('common.http_error');
    expect(JSON.stringify(body)).not.toContain('Unexpected token');
  });

  it('hides unknown errors behind common.internal_error and logs them', () => {
    const error = new Error('connection string postgresql://user:pass@db leaked');

    const body = handle(error);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(body.code).toBe('common.internal_error');
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('postgresql://');
    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'unhandled_error');
  });
});
