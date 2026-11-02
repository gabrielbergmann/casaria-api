import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DomainError } from '../errors/domain-error';
import { toProblemDetails } from '../errors/problem-details';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const problem = toProblemDetails(exception);
    // Nos 500 o detalhe fica só no log; a resposta não leva stack nem mensagem interna.
    if (problem.status >= 500) this.logger.error({ err: exception }, 'unhandled_error');
    const response = host.switchToHttp().getResponse<Response>();
    const headers = exception instanceof DomainError ? exception.headers : undefined;
    for (const [name, value] of Object.entries(headers ?? {})) response.setHeader(name, value);
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
