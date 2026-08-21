import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PostIngestProcessorService } from './../src/ingestion/post-ingest-processor.service';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  accessToken: string;
}

interface IdResponse {
  id: string;
}

interface ApiKeyResponse {
  key: string;
}

interface RcaResponse {
  explanation: string;
}

describe('Advanced observability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let postIngest: PostIngestProcessorService;
  let firstToken: string;
  let secondToken: string;
  let projectId: string;
  let secondProjectId: string;
  let apiKey: string;
  let disabledRuleId: string;
  let firstAlertEventId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `advanced-first-${suffix}@example.com`;
  const secondEmail = `advanced-second-${suffix}@example.com`;
  const firstOrganizationSlug = `advanced-first-${suffix}`;
  const secondOrganizationSlug = `advanced-second-${suffix}`;
  const successTraceId = randomUUID();
  const failedTraceId = randomUUID();
  const failedSpanId = randomUUID();
  const originalWebhookConfig = process.env.ALERT_WEBHOOK_URLS_JSON;
  const originalRcaKey = process.env.RCA_PROVIDER_API_KEY;
  const originalRcaModel = process.env.RCA_PROVIDER_MODEL;

  beforeAll(async () => {
    delete process.env.ALERT_WEBHOOK_URLS_JSON;
    delete process.env.RCA_PROVIDER_API_KEY;
    delete process.env.RCA_PROVIDER_MODEL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    postIngest = app.get(PostIngestProcessorService);

    const firstSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: firstEmail, password })
      .expect(201);
    firstToken = (firstSignup.body as AuthResponse).accessToken;
    const secondSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: secondEmail, password })
      .expect(201);
    secondToken = (secondSignup.body as AuthResponse).accessToken;

    const firstOrganization = (
      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${firstToken}`)
        .send({ name: 'Advanced First', slug: firstOrganizationSlug })
        .expect(201)
    ).body as IdResponse;
    const secondOrganization = (
      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ name: 'Advanced Second', slug: secondOrganizationSlug })
        .expect(201)
    ).body as IdResponse;

    const firstProject = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganization.id}/projects`)
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ name: 'Advanced Project', slug: `advanced-${suffix}` })
      .expect(201);
    projectId = (firstProject.body as IdResponse).id;
    const secondProject = await request(app.getHttpServer())
      .post(`/organizations/${secondOrganization.id}/projects`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ name: 'Second Project', slug: `advanced-${suffix}` })
      .expect(201);
    secondProjectId = (secondProject.body as IdResponse).id;
    const keyResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/api-keys`)
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ name: 'Advanced ingestion' })
      .expect(201);
    apiKey = (keyResponse.body as ApiKeyResponse).key;

    for (const rule of [
      { name: 'Error rate', type: 'error_rate', threshold: 0.5 },
      { name: 'Average latency', type: 'latency', threshold: 1000 },
      { name: 'Window cost', type: 'cost', threshold: 1 },
    ]) {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alert-rules`)
        .set('Authorization', `Bearer ${firstToken}`)
        .send(rule)
        .expect(201);
    }
    const disabledRule = await request(app.getHttpServer())
      .post(`/projects/${projectId}/alert-rules`)
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ name: 'Disabled cost', type: 'cost', threshold: 0.01 })
      .expect(201);
    disabledRuleId = (disabledRule.body as IdResponse).id;
    await request(app.getHttpServer())
      .patch(`/alert-rules/${disabledRuleId}`)
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ enabled: false })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        slug: { in: [firstOrganizationSlug, secondOrganizationSlug] },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [firstEmail, secondEmail] } },
    });
    await app.close();
    restoreEnvironment('ALERT_WEBHOOK_URLS_JSON', originalWebhookConfig);
    restoreEnvironment('RCA_PROVIDER_API_KEY', originalRcaKey);
    restoreEnvironment('RCA_PROVIDER_MODEL', originalRcaModel);
  });

  it('does not trigger rules below threshold or disabled rules', async () => {
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(tracePayload(successTraceId, 'success', 500, '0.1'))
      .expect(202);
    await postIngest.waitForIdle();

    expect(await prisma.alertEvent.count({ where: { projectId } })).toBe(0);
  });

  it('triggers enabled error-rate, latency, and cost rules without failing on webhook errors', async () => {
    process.env.ALERT_WEBHOOK_URLS_JSON = JSON.stringify({
      [projectId]: 'http://127.0.0.1:1/mock-alerts',
    });

    const response = await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(
        tracePayload(failedTraceId, 'failed', 2000, '2', [
          {
            id: failedSpanId,
            traceId: failedTraceId,
            type: 'tool_call',
            name: 'search-service',
            status: 'failed',
            startedAt: '2026-08-21T12:01:00.100Z',
            endedAt: '2026-08-21T12:01:01.900Z',
            latencyMs: 1800,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: '0',
            errorType: 'TimeoutError',
            errorMessage: 'Search service timed out',
          },
        ]),
      )
      .expect(202);
    expect(response.body).toEqual({
      traceId: failedTraceId,
      spansProcessed: 1,
    });
    await postIngest.waitForIdle();

    const events = await prisma.alertEvent.findMany({
      where: { projectId },
      orderBy: { ruleType: 'asc' },
    });
    expect(events.map(({ ruleType }) => ruleType).sort()).toEqual([
      'cost',
      'error_rate',
      'latency',
    ]);
    expect(events.every(({ traceId }) => traceId === failedTraceId)).toBe(true);
    expect(
      events.every(({ deliveryStatus }) => deliveryStatus === 'failed'),
    ).toBe(true);
    expect(
      events.some(({ alertRuleId }) => alertRuleId === disabledRuleId),
    ).toBe(false);

    const values = Object.fromEntries(
      events.map((event) => [event.ruleType, event.observedValue.toString()]),
    );
    expect(values).toMatchObject({
      error_rate: '0.5',
      latency: '1250',
      cost: '2.1',
    });
    firstAlertEventId = events[0].id;
  });

  it('does not duplicate alert events when ingestion is repeated', async () => {
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(
        tracePayload(failedTraceId, 'failed', 2000, '2', [
          {
            id: failedSpanId,
            traceId: failedTraceId,
            type: 'tool_call',
            name: 'search-service',
            status: 'failed',
            startedAt: '2026-08-21T12:01:00.100Z',
            endedAt: '2026-08-21T12:01:01.900Z',
            latencyMs: 1800,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: '0',
            errorType: 'TimeoutError',
            errorMessage: 'Search service timed out',
          },
        ]),
      )
      .expect(202);
    await postIngest.waitForIdle();

    expect(await prisma.alertEvent.count({ where: { projectId } })).toBe(3);
  });

  it('allows only project members to read alert events', async () => {
    const memberList = await request(app.getHttpServer())
      .get(`/projects/${projectId}/alert-events`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    expect(memberList.body).toHaveLength(3);

    await request(app.getHttpServer())
      .get(`/alert-events/${firstAlertEventId}`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/alert-events`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/alert-events`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/alert-events/${firstAlertEventId}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/events`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/events`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);
    expect(secondProjectId).not.toBe(projectId);
  });

  it('returns a safe local RCA when no provider is configured', async () => {
    const response = await request(app.getHttpServer())
      .post(`/traces/${failedTraceId}/rca`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'unavailable',
      providerConfigured: false,
      likelyFailingSpan: {
        id: failedSpanId,
        name: 'search-service',
        type: 'tool_call',
      },
    });
    expect((response.body as RcaResponse).explanation).toContain(
      'Search service timed out',
    );

    await request(app.getHttpServer())
      .post(`/traces/${failedTraceId}/rca`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);
  });
});

function tracePayload(
  id: string,
  status: 'success' | 'failed',
  durationMs: number,
  totalCost: string,
  spans: unknown[] = [],
) {
  const startedAt =
    status === 'success'
      ? '2026-08-21T12:00:00.000Z'
      : '2026-08-21T12:01:00.000Z';
  const endedAt = new Date(Date.parse(startedAt) + durationMs).toISOString();
  return {
    id,
    agentName: 'advanced-agent',
    name: `${status} advanced trace`,
    status,
    startedAt,
    endedAt,
    durationMs,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    totalCost,
    errorType: status === 'failed' ? 'AgentError' : undefined,
    errorMessage: status === 'failed' ? 'Agent execution failed' : undefined,
    spans,
  };
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
