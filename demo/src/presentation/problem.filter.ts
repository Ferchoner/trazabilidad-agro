import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../domain/errors';
import { IdempotencyConflict, InputError, PermissionError } from '../application/trace.service';

/** Errores como Problem Details (RFC 9457), como en base-shop. Sin detalles internos al cliente. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let title = 'Error interno';
    let detail = 'Ocurrió un error inesperado.';
    let code: string | undefined;
    if (err instanceof DomainError) {
      status = 422;
      title = 'Regla de negocio';
      detail = err.message;
      code = err.code;
    } else if (err instanceof PermissionError) {
      status = 403;
      title = 'Sin permiso';
      detail = err.message;
    } else if (err instanceof IdempotencyConflict) {
      status = 409;
      title = 'Evento repetido con otro contenido';
      detail = err.message;
      code = 'BR-EVT-02';
    } else if (err instanceof InputError) {
      status = 400;
      title = 'Datos incompletos';
      detail = err.message;
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      title = err.message;
      detail = err.message;
    } else {
      this.logger.error(err instanceof Error ? err.stack : String(err));
    }
    res
      .status(status)
      .type('application/problem+json')
      .json({ type: 'about:blank', title, status, detail, ...(code ? { code } : {}) });
  }
}
