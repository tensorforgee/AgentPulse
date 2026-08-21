import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { JsonLoggerService } from './json-logger.service';
import type { OperationalRequest } from './request-context.types';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestId(request: OperationalRequest): string {
  const supplied = request.get('x-request-id');
  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

@Injectable()
export class RequestDiagnosticsMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLoggerService) {}

  use(
    request: OperationalRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const startedAt = performance.now();
    const id = requestId(request);
    request.requestId = id;
    response.setHeader('x-request-id', id);

    let logged = false;
    const logCompletion = (aborted: boolean) => {
      if (logged) {
        return;
      }
      logged = true;
      this.logger.logEvent('info', 'http.request.completed', {
        requestId: id,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(aborted ? { aborted: true } : {}),
      });
    };

    response.once('finish', () => logCompletion(false));
    response.once('close', () => logCompletion(!response.writableEnded));
    next();
  }
}
