import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import type { JsonLoggerService } from './json-logger.service';
import { OperationalExceptionFilter } from './operational-exception.filter';
import type { OperationalRequest } from './request-context.types';

describe('OperationalExceptionFilter', () => {
  function setup() {
    const logEvent = jest.fn();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const end = jest.fn();
    const request = {
      method: 'POST',
      path: '/v1/ingest',
      requestId: 'request-123',
    } as OperationalRequest;
    const response = {
      end,
      headersSent: false,
      json,
      status,
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const filter = new OperationalExceptionFilter({
      logEvent,
    } as unknown as JsonLoggerService);
    return { filter, host, json, logEvent, status };
  }

  it('preserves existing HTTP exception responses', () => {
    const { filter, host, json, logEvent, status } = setup();
    const exception = new BadRequestException('Malformed telemetry');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'http.request.failed',
      expect.objectContaining({
        requestId: 'request-123',
        statusCode: 400,
        errorType: 'BadRequestException',
      }),
    );
  });

  it('returns a sanitized 500 without logging the internal message', () => {
    const { filter, host, json, logEvent, status } = setup();
    const secret = 'database-password-must-not-leak';

    filter.catch(new Error(secret), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain(secret);
  });

  it('sanitizes unknown library-style 5xx error messages', () => {
    const { filter, host, json, logEvent, status } = setup();
    const secret = 'upstream-secret-must-not-leak';

    filter.catch({ statusCode: 502, message: secret }, host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      statusCode: 502,
      message: 'Internal server error',
    });
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain(secret);
  });
});
