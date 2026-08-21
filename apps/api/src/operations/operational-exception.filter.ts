import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { JsonLoggerService } from './json-logger.service';
import type { OperationalRequest } from './request-context.types';

interface HttpErrorLike {
  message: string;
  statusCode: number;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HttpErrorLike>;
  return (
    typeof candidate.message === 'string' &&
    Number.isInteger(candidate.statusCode) &&
    (candidate.statusCode ?? 0) >= 400 &&
    (candidate.statusCode ?? 0) <= 599
  );
}

@Catch()
export class OperationalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<OperationalRequest>();
    const response = http.getResponse<Response>();
    const { statusCode, body } = this.responseFor(exception);

    this.logger.logEvent(
      statusCode >= 500 ? 'error' : 'warn',
      'http.request.failed',
      {
        requestId: request.requestId ?? null,
        method: request.method,
        path: request.path,
        statusCode,
        errorType:
          exception instanceof Error ? exception.name : typeof exception,
      },
    );

    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(statusCode).json(body);
  }

  private responseFor(exception: unknown): {
    statusCode: number;
    body: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      return {
        statusCode,
        body:
          response !== null && typeof response === 'object'
            ? response
            : { statusCode, message: response },
      };
    }
    if (isHttpErrorLike(exception)) {
      if (exception.statusCode >= 500) {
        return {
          statusCode: exception.statusCode,
          body: {
            statusCode: exception.statusCode,
            message: 'Internal server error',
          },
        };
      }
      return {
        statusCode: exception.statusCode,
        body: {
          statusCode: exception.statusCode,
          message: exception.message,
        },
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    };
  }
}
