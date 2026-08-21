import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { JsonLoggerService } from './json-logger.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  function setup() {
    const queryRaw = jest.fn();
    const logEvent = jest.fn();
    const service = new HealthService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { logEvent } as unknown as JsonLoggerService,
    );
    return { logEvent, queryRaw, service };
  }

  it('reports liveness and PostgreSQL readiness', async () => {
    const { queryRaw, service } = setup();
    queryRaw.mockResolvedValue([{ result: 1 }]);

    expect(service.liveness()).toEqual({ status: 'ok' });
    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without exposing a database failure', async () => {
    const { logEvent, queryRaw, service } = setup();
    queryRaw.mockRejectedValue(new Error('secret database detail'));

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(logEvent).toHaveBeenCalledWith('error', 'health.readiness.failed', {
      dependency: 'postgresql',
    });
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain(
      'secret database detail',
    );
  });
});
