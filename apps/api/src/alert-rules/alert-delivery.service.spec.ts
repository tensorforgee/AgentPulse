import { Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AlertDeliveryService } from './alert-delivery.service';
import type { AlertEventRecord } from './alert-event.types';
import type {
  AlertWebhookService,
  WebhookDeliveryResult,
} from './alert-webhook.service';

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
    deliveryError: null,
    createdAt: new Date('2026-08-21T10:05:00.000Z'),
  } satisfies AlertEventRecord;
  let update: jest.MockedFunction<UpdateAlertEvent>;
  let deliver: jest.MockedFunction<
    (projectId: string, payload: unknown) => Promise<WebhookDeliveryResult>
  >;
  let service: AlertDeliveryService;

  beforeEach(() => {
    update = jest.fn(({ data }) =>
      Promise.resolve({
        ...event,
        deliveryStatus: data.deliveryStatus,
        deliveryAttemptedAt: data.deliveryAttemptedAt,
        deliveryError: data.deliveryError,
      }),
    );
    deliver = jest.fn(() =>
      Promise.resolve({
        status: 'delivered',
        attemptedAt: new Date('2026-08-21T10:05:01.000Z'),
        error: null,
      }),
    );
    service = new AlertDeliveryService(
      { alertEvent: { update } } as unknown as PrismaService,
      { deliver } as unknown as AlertWebhookService,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the existing structured payload to webhook delivery and records success', async () => {
    const delivered = await service.deliver(event);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toBe(projectId);
    const payload = deliver.mock.calls[0]?.[1] as {
      text: string;
      agentpulse: Record<string, unknown>;
    };
    expect(payload.text).toContain('[AgentPulse] High cost triggered');
    expect(payload.agentpulse).toMatchObject({
      id: event.id,
      projectId,
      traceId: event.traceId,
      deliveryStatus: 'pending',
      deliveryError: null,
    });
    expect(delivered.deliveryStatus).toBe('delivered');
  });

  it('persists sanitized delivery failures without throwing', async () => {
    deliver.mockResolvedValue({
      status: 'failed',
      attemptedAt: new Date('2026-08-21T10:05:01.000Z'),
      error: 'Request failed',
    });

    await expect(service.deliver(event)).resolves.toMatchObject({
      deliveryStatus: 'failed',
      deliveryError: 'Request failed',
    });
    expect(update.mock.calls.at(-1)?.[0].data.deliveryError).toBe(
      'Request failed',
    );
  });

  it('records missing or invalid configuration diagnostics', async () => {
    deliver.mockResolvedValue({
      status: 'not_configured',
      attemptedAt: null,
      error: 'ALERT_WEBHOOK_URLS_JSON contains invalid JSON',
    });

    await expect(service.deliver(event)).resolves.toMatchObject({
      deliveryStatus: 'not_configured',
      deliveryAttemptedAt: null,
      deliveryError: 'ALERT_WEBHOOK_URLS_JSON contains invalid JSON',
    });
  });
});
