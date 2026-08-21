import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  accessToken: string;
}

interface IdResponse {
  id: string;
}

interface ApiKeyResponse extends IdResponse {
  key: string;
}

describe('Telemetry ingestion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let firstAuth: AuthResponse;
  let secondAuth: AuthResponse;
  let firstProjectId: string;
  let secondProjectId: string;
  let plaintextKey: string;
  let secondPlaintextKey: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `ingest-first-${suffix}@example.com`;
  const secondEmail = `ingest-second-${suffix}@example.com`;
  const firstOrganizationSlug = `ingest-first-${suffix}`;
  const secondOrganizationSlug = `ingest-second-${suffix}`;
  const traceId = randomUUID();
  const rootSpanId = randomUUID();
  const llmSpanId = randomUUID();
  const toolSpanId = randomUUID();

  const telemetryPayload = {
    id: traceId,
    agentName: 'support-agent',
    name: 'Resolve support request',
    status: 'success',
    startedAt: '2026-08-21T10:00:00.000Z',
    endedAt: '2026-08-21T10:00:02.000Z',
    durationMs: 2000,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    totalCost: '0.00350000',
    metadata: { environment: 'test', attempt: 1 },
    spans: [
      {
        id: toolSpanId,
        traceId,
        parentSpanId: llmSpanId,
        type: 'tool_call',
        name: 'lookup-ticket',
        status: 'success',
        startedAt: '2026-08-21T10:00:00.800Z',
        endedAt: '2026-08-21T10:00:01.200Z',
        latencyMs: 400,
        input: { ticketId: 'T-42' },
        output: { priority: 'high' },
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: '0',
        attributes: { tool: 'ticket-db' },
      },
      {
        id: llmSpanId,
        traceId,
        parentSpanId: rootSpanId,
        type: 'llm_call',
        name: 'classify-ticket',
        status: 'success',
        startedAt: '2026-08-21T10:00:00.200Z',
        endedAt: '2026-08-21T10:00:01.500Z',
        latencyMs: 1300,
        input: { prompt: 'Classify ticket T-42' },
        output: { classification: 'urgent' },
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: '0.00350000',
        provider: 'openai',
        model: 'test-model',
      },
      {
        id: rootSpanId,
        traceId,
        type: 'agent',
        name: 'support-agent-run',
        status: 'success',
        startedAt: '2026-08-21T10:00:00.000Z',
        endedAt: '2026-08-21T10:00:02.000Z',
        latencyMs: 2000,
        input: { ticketId: 'T-42' },
        output: { resolved: true },
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: '0',
      },
    ],
  };

  beforeAll(async () => {
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

    await prisma.organization.deleteMany({
      where: {
        slug: { in: [firstOrganizationSlug, secondOrganizationSlug] },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [firstEmail, secondEmail] } },
    });

    firstAuth = (
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: firstEmail, password })
        .expect(201)
    ).body as AuthResponse;
    secondAuth = (
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: secondEmail, password })
        .expect(201)
    ).body as AuthResponse;

    const firstOrganizationResponse = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({
        name: 'First Ingestion Organization',
        slug: firstOrganizationSlug,
      })
      .expect(201);
    const firstOrganizationId = (firstOrganizationResponse.body as IdResponse)
      .id;
    const secondOrganizationResponse = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({
        name: 'Second Ingestion Organization',
        slug: secondOrganizationSlug,
      })
      .expect(201);
    const secondOrganizationId = (secondOrganizationResponse.body as IdResponse)
      .id;

    const firstProjectResponse = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'First Ingestion Project', slug: `ingest-${suffix}` })
      .expect(201);
    firstProjectId = (firstProjectResponse.body as IdResponse).id;
    const secondProjectResponse = await request(app.getHttpServer())
      .post(`/organizations/${secondOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Ingestion Project', slug: `ingest-${suffix}` })
      .expect(201);
    secondProjectId = (secondProjectResponse.body as IdResponse).id;

    const firstKeyResponse = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'First ingestion key' })
      .expect(201);
    plaintextKey = (firstKeyResponse.body as ApiKeyResponse).key;
    const secondKeyResponse = await request(app.getHttpServer())
      .post(`/projects/${secondProjectId}/api-keys`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second ingestion key' })
      .expect(201);
    secondPlaintextKey = (secondKeyResponse.body as ApiKeyResponse).key;
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
  });

  it('rejects an invalid API key', async () => {
    const invalidKey = `ap_live_${randomBytes(6).toString('base64url')}_${randomBytes(32).toString('base64url')}`;

    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${invalidKey}`)
      .send(telemetryPayload)
      .expect(401);
  });

  it('rejects revoked and expired API keys', async () => {
    const revoked = (
      await request(app.getHttpServer())
        .post(`/projects/${firstProjectId}/api-keys`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .send({ name: 'Revoked ingestion key' })
        .expect(201)
    ).body as ApiKeyResponse;
    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys/${revoked.id}/revoke`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${revoked.key}`)
      .send(telemetryPayload)
      .expect(401);

    const expired = (
      await request(app.getHttpServer())
        .post(`/projects/${firstProjectId}/api-keys`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .send({ name: 'Expired ingestion key' })
        .expect(201)
    ).body as ApiKeyResponse;
    await prisma.apiKey.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${expired.key}`)
      .send(telemetryPayload)
      .expect(401);
  });

  it('rejects malformed telemetry without persisting it', async () => {
    const malformedId = randomUUID();

    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${plaintextKey}`)
      .send({ ...telemetryPayload, id: malformedId, status: 'unknown' })
      .expect(400);

    expect(
      await prisma.trace.findUnique({ where: { id: malformedId } }),
    ).toBeNull();
  });

  it('rejects a client-supplied projectId', async () => {
    const spoofedId = randomUUID();

    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${plaintextKey}`)
      .send({
        ...telemetryPayload,
        id: spoofedId,
        projectId: secondProjectId,
      })
      .expect(400);

    expect(
      await prisma.trace.findUnique({ where: { id: spoofedId } }),
    ).toBeNull();
  });

  it('ingests a trace with nested spans into the authenticated project', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${plaintextKey}`)
      .send(telemetryPayload)
      .expect(202);

    expect(response.body).toEqual({ traceId, spansProcessed: 3 });

    const stored = await prisma.trace.findUniqueOrThrow({
      where: { id: traceId },
      include: { spans: { orderBy: { startedAt: 'asc' } } },
    });
    expect(stored.projectId).toBe(firstProjectId);
    expect(stored.totalTokens).toBe(150n);
    expect(stored.totalCost.toString()).toBe('0.0035');
    expect(stored.metadata).toEqual({ environment: 'test', attempt: 1 });
    expect(stored.spans).toHaveLength(3);

    const llm = stored.spans.find((span) => span.id === llmSpanId);
    const tool = stored.spans.find((span) => span.id === toolSpanId);
    expect(llm).toMatchObject({
      traceId,
      parentSpanId: rootSpanId,
      spanType: 'llm_call',
      inputTokens: 100n,
      outputTokens: 50n,
      provider: 'openai',
      model: 'test-model',
    });
    expect(llm?.input).toEqual({ prompt: 'Classify ticket T-42' });
    expect(llm?.output).toEqual({ classification: 'urgent' });
    expect(llm?.estimatedCost.toString()).toBe('0.0035');
    expect(tool).toMatchObject({
      traceId,
      parentSpanId: llmSpanId,
      spanType: 'tool_call',
      latencyMs: 400n,
    });
  });

  it('is idempotent for repeated trace and span IDs', async () => {
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${plaintextKey}`)
      .send(telemetryPayload)
      .expect(202);

    expect(await prisma.trace.count({ where: { id: traceId } })).toBe(1);
    expect(await prisma.span.count({ where: { traceId } })).toBe(3);
  });

  it('cannot move an existing trace into another API key project', async () => {
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${secondPlaintextKey}`)
      .send(telemetryPayload)
      .expect(409);

    const stored = await prisma.trace.findUniqueOrThrow({
      where: { id: traceId },
    });
    expect(stored.projectId).toBe(firstProjectId);
  });
});
