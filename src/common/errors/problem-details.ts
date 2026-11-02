import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodValidationException } from 'nestjs-zod';
import { DomainError } from './domain-error';

export interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  code: string;
  errors?: { path: string; message: string }[];
  /** Membros de extensão do erro de domínio (RFC 9457). */
  [extension: string]: unknown;
}

const problem = (status: number, code: string, title: string): ProblemDetails => ({
  type: 'about:blank',
  title,
  status,
  code,
});

const INTERNAL_ERROR = problem(
  HttpStatus.INTERNAL_SERVER_ERROR,
  'common.internal_error',
  'Erro interno. Tente novamente mais tarde.',
);

function toValidationErrors(zodError: unknown): ProblemDetails['errors'] {
  const issues =
    (zodError as { issues?: { path: PropertyKey[]; message: string }[] })?.issues ?? [];
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

// Converte qualquer exceção no corpo de erro da API (RFC 9457 com code dominio.motivo).
export function toProblemDetails(exception: unknown): ProblemDetails {
  if (exception instanceof DomainError) {
    return {
      ...exception.extensions,
      ...problem(exception.status, exception.code, exception.title),
    };
  }
  if (exception instanceof ZodValidationException) {
    return {
      ...problem(HttpStatus.BAD_REQUEST, 'common.validation_failed', 'Dados inválidos.'),
      errors: toValidationErrors(exception.getZodError()),
    };
  }
  if (exception instanceof ThrottlerException) {
    return problem(
      HttpStatus.TOO_MANY_REQUESTS,
      'common.rate_limited',
      'Muitas requisições. Tente novamente em instantes.',
    );
  }
  if (exception instanceof NotFoundException) {
    return problem(HttpStatus.NOT_FOUND, 'common.not_found', 'Recurso não encontrado.');
  }
  if (exception instanceof HttpException && exception.getStatus() < 500) {
    return problem(
      exception.getStatus(),
      'common.http_error',
      'Não foi possível processar a requisição.',
    );
  }
  return INTERNAL_ERROR;
}
