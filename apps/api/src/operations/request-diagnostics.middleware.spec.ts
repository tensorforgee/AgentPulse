import { EventEmitter } from 'node:events';
import type { NextFunction, Response } from 'express';
import type { JsonLoggerService } from './json-logger.service';
import type { OperationalRequest } from './request-context.types';
import { RequestDiagnosticsMiddleware } from './request-diagnostics.middleware';

describe('RequestDiagnosticsMiddleware', () => {
  it('propagates a safe request ID and logs only request metadata', () => {
    const logEvent = jest.fn();
    const middleware = new RequestDiagnosticsMiddleware({
      logEvent,
    } as unknown as JsonLoggerService);
    const request = {
      body: { password: 'must-not-be-logged' },
      get: jest.fn().mockReturnValue('client-request-123'),
      method: 'POST',
      path: '/auth/login',
    } as unknown as OperationalRequest;
    const emitter = new EventEmitter();
    const setHeader = jest.fn();
    Object.assign(emitter, {
      setHeader,
      statusCode: 200,
      writableEnded: true,
    });
    const next = jest.fn() as NextFunction;

    middleware.use(request, emitter as unknown as Response, next);
    emitter.emit('finish');

    expect(request.requestId).toBe('client-request-123');
    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'client-request-123',
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      'info',
      'http.request.completed',
      expect.objectContaining({
        requestId: 'client-request-123',
        method: 'POST',
        path: '/auth/login',
        statusCode: 200,
      }),
    );
    expect(JSON.stringify(logEvent.mock.calls)).toMatch(/"durationMs":\d+/);
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain(
      'must-not-be-logged',
    );
  });

  it('replaces an unsafe incoming request ID', () => {
    const middleware = new RequestDiagnosticsMiddleware({
      logEvent: jest.fn(),
    } as unknown as JsonLoggerService);
    const request = {
      get: jest.fn().mockReturnValue('unsafe request id'),
      method: 'GET',
      path: '/health/live',
    } as unknown as OperationalRequest;
    const emitter = new EventEmitter();
    const setHeader = jest.fn();
    Object.assign(emitter, {
      setHeader,
      statusCode: 200,
      writableEnded: true,
    });

    middleware.use(
      request,
      emitter as unknown as Response,
      jest.fn() as NextFunction,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(request.requestId).not.toBe('unsafe request id');
  });
});
