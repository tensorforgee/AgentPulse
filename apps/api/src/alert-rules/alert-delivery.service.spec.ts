import { Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AlertEventRecord } from './alert-event.types';
import { AlertDeliveryService } from './alert-delivery.service';

type UpdateAlertEvent = (input: {
  data: {
    deliveryStatus: string;
    deliveryAttemptedAt: Date | null;
    deliveryError: string | null;
  };
}) => Promise<AlertEventRecord>;

describe('AlertDeliveryService', () => {
  const projectId = '7cb34107-8c31-4c33-af45-c7e33c123fb0';
  const event = {
    id: '1e399dc9-34de-446b-912f-5fc719b018fc',
    projectId,
    alertRuleId: '39cc1c3e-5519-4057-a2da-bb480e10c2c7',
    traceId: '6ca54026-bf99-43ad-91d9-fd6f9ab2a945',
    ruleName: 'High cost',
    ruleType: 'cost',
    threshold: new Prisma.Decimal(1),
    observedValue: new Prisma.Decimal(2),
    windowStartedAt: new Date('2026-08-21T10:00:00.000Z'),
    windowEndedAt: new Date('2026-08-21T10:05:00.000Z'),
    deliveryStatus: 'pending',
    deliveryAttemptedAt: null,
    createdAt: new Date('2026-08-21T10:05:00.000Z'),
  } satisfies AlertEventRecord;
  const originalConfig = process.env.ALERT_WEBHOOK_URLS_JSON;
  const originalNodeEnvironment = process.env.NODE_ENV;
  let update: jest.MockedFunction<UpdateAlertEvent>;
  let service: AlertDeliveryService;

  beforeEach(() => {
    process.env.ALERT_WEBHOOK_URLS_JSON = JSON.stringify({
      [projectId]: 'http://mock.local/agentpulse',
    });
    update = jest.fn(({ data }) =>
      Promise.resolve({
        ...event,
        deliveryStatus: data.deliveryStatus,
        deliveryAttemptedAt: data.deliveryAttemptedAt,
      }),
    );
    service = new AlertDeliveryService({
      alertEvent: { update },
    } as unknown as PrismaService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalConfig === undefined) {
      delete process.env.ALERT_WEBHOOK_URLS_JSON;
    } else {
      process.env.ALERT_WEBHOOK_URLS_JSON = originalConfig;
    }
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it('sends a Slack-compatible payload and records success', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const delivered = await service.deliver(event);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://mock.local/agentpulse',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    expect(typeof requestBody).toBe('string');
    const payload = JSON.parse(
      typeof requestBody === 'string' ? requestBody : '{}',
    ) as Record<string, unknown>;
    expect(payload.text).toContain('[AgentPulse] High cost triggered');
    expect(payload.agentpulse).toBeDefined();
    expect(delivered.deliveryStatus).toBe('delivered');
  });

  it('records a sanitized failure without throwing', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('secret URL failed'));

    await expect(service.deliver(event)).resolves.toMatchObject({
      deliveryStatus: 'failed',
    });
    expect(update.mock.calls.at(-1)?.[0].data.deliveryError).toBe(
      'Request failed',
    );
  });

  it('does not deliver to plaintext HTTP webhooks in production', async () => {
    process.env.NODE_ENV = 'production';
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(service.deliver(event)).resolves.toMatchObject({
      deliveryStatus: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
