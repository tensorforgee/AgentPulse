import { randomUUID } from 'node:crypto';
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

interface TraceListItem {
  id: string;
  projectId: string;
  agentName: string;
  name: string | null;
  status: string;
  startedAt: string;
  totalTokens: number;
  totalCost: string;
}

interface TraceListResponse {
  data: TraceListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface SpanResponse {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  type: string;
  name: string;
  status: string;
  startedAt: string;
  latencyMs: number | null;
  input: unknown;
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
  errorType: string | null;
  errorMessage: string | null;
}

interface TraceDetailResponse extends TraceListItem {
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  metadata: unknown;
  errorType: string | null;
  errorMessage: string | null;
  spans: SpanResponse[];
}

describe('Trace read APIs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let firstAuth: AuthResponse;
  let secondAuth: AuthResponse;
  let firstProjectId: string;
  let emptyProjectId: string;
  let secondProjectId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `trace-read-first-${suffix}@example.com`;
  const secondEmail = `trace-read-second-${suffix}@example.com`;
  const firstOrganizationSlug = `trace-read-first-${suffix}`;
  const secondOrganizationSlug = `trace-read-second-${suffix}`;
  const oldestTraceId = randomUUID();
  const middleTraceId = randomUUID();
  const newestTraceId = randomUUID();
  const crossTenantTraceId = randomUUID();
  const rootSpanId = randomUUID();
  const childSpanId = randomUUID();

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
      .send({ name: 'Trace Read One', slug: firstOrganizationSlug })
      .expect(201);
    const firstOrganizationId = (firstOrganizationResponse.body as IdResponse)
      .id;
    const secondOrganizationResponse = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Trace Read Two', slug: secondOrganizationSlug })
      .expect(201);
    const secondOrganizationId = (secondOrganizationResponse.body as IdResponse)
      .id;

    const firstProjectResponse = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'Populated Project', slug: `populated-${suffix}` })
      .expect(201);
    firstProjectId = (firstProjectResponse.body as IdResponse).id;
    const emptyProjectResponse = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'Empty Project', slug: `empty-${suffix}` })
      .expect(201);
    emptyProjectId = (emptyProjectResponse.body as IdResponse).id;
    const secondProjectResponse = await request(app.getHttpServer())
      .post(`/organizations/${secondOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Other Tenant Project', slug: `other-${suffix}` })
      .expect(201);
    secondProjectId = (secondProjectResponse.body as IdResponse).id;

    await prisma.trace.createMany({
      data: [
        {
          id: oldestTraceId,
          projectId: firstProjectId,
          agentName: 'billing-agent',
          name: 'Old Failure',
          status: 'failed',
          startedAt: new Date('2026-08-18T10:00:00.000Z'),
          endedAt: new Date('2026-08-18T10:00:00.500Z'),
          durationMs: 500,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          totalCost: '0.00100000',
          metadata: { environment: 'test', order: 1 },
          errorType: 'ToolError',
          errorMessage: 'Billing lookup failed',
        },
        {
          id: middleTraceId,
          projectId: firstProjectId,
          agentName: 'support-agent',
          name: 'Middle Success',
          status: 'success',
          startedAt: new Date('2026-08-19T10:00:00.000Z'),
          endedAt: new Date('2026-08-19T10:00:01.000Z'),
          durationMs: 1000,
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          totalCost: '0.00200000',
          metadata: { environment: 'test', order: 2 },
        },
        {
          id: newestTraceId,
          projectId: firstProjectId,
          agentName: 'research-agent',
          name: 'Newest Retrieval Run',
          status: 'success',
          startedAt: new Date('2026-08-20T10:00:00.000Z'),
          endedAt: new Date('2026-08-20T10:00:02.000Z'),
          durationMs: 2000,
          inputTokens: 40,
          outputTokens: 20,
          totalTokens: 60,
          totalCost: '0.00450000',
          metadata: { environment: 'test', order: 3 },
        },
        {
          id: crossTenantTraceId,
          projectId: secondProjectId,
          agentName: 'other-agent',
          name: 'Other Tenant Trace',
          status: 'success',
          startedAt: new Date('2026-08-20T12:00:00.000Z'),
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          totalCost: '0.00010000',
          metadata: {},
        },
      ],
    });

    await prisma.span.create({
      data: {
        id: rootSpanId,
        traceId: newestTraceId,
        name: 'agent-root',
        spanType: 'agent',
        status: 'success',
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        endedAt: new Date('2026-08-20T10:00:02.000Z'),
        latencyMs: 2000,
        input: { question: 'Find sources' },
        output: { complete: true },
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: '0',
        attributes: { level: 'root' },
      },
    });
    await prisma.span.create({
      data: {
        id: childSpanId,
        traceId: newestTraceId,
        parentSpanId: rootSpanId,
        name: 'vector-search',
        spanType: 'retrieval',
        status: 'failed',
        startedAt: new Date('2026-08-20T10:00:00.200Z'),
        endedAt: new Date('2026-08-20T10:00:00.600Z'),
        latencyMs: 400,
        input: { query: 'Agent observability' },
        output: { documents: 2 },
        inputTokens: 40,
        outputTokens: 20,
        estimatedCost: '0.00450000',
        attributes: { index: 'docs' },
        errorType: 'PartialResult',
        errorMessage: 'One source timed out',
      },
    });
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

  it('rejects unauthenticated trace list and detail requests', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/traces`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/traces/${newestTraceId}`)
      .expect(401);
  });

  it('returns a clean empty paginated response', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${emptyProjectId}/traces`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('lists project traces newest first as dashboard-ready JSON', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/traces`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    const body = response.body as TraceListResponse;

    expect(body.data.map((trace) => trace.id)).toEqual([
      newestTraceId,
      middleTraceId,
      oldestTraceId,
    ]);
    expect(body.data[0]).toMatchObject({
      projectId: firstProjectId,
      totalTokens: 60,
      totalCost: '0.0045',
    });
    expect(typeof body.data[0].startedAt).toBe('string');
    expect(body.pagination).toMatchObject({ total: 3, totalPages: 1 });
  });

  it('paginates safely without duplicate rows', async () => {
    const firstPage = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?page=1&pageSize=2`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    const secondPage = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?page=2&pageSize=2`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;

    expect(firstPage.data.map((trace) => trace.id)).toEqual([
      newestTraceId,
      middleTraceId,
    ]);
    expect(secondPage.data.map((trace) => trace.id)).toEqual([oldestTraceId]);
    expect(firstPage.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(secondPage.pagination).toMatchObject({
      page: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/traces?pageSize=101`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(400);
  });

  it('supports status, time range, agent/name, and exact id filters', async () => {
    const failed = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?status=failed`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    expect(failed.data.map((trace) => trace.id)).toEqual([oldestTraceId]);

    const ranged = (
      await request(app.getHttpServer())
        .get(
          `/projects/${firstProjectId}/traces?from=2026-08-19T00:00:00.000Z&to=2026-08-19T23:59:59.999Z`,
        )
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    expect(ranged.data.map((trace) => trace.id)).toEqual([middleTraceId]);

    const byAgent = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?search=RESEARCH`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    expect(byAgent.data.map((trace) => trace.id)).toEqual([newestTraceId]);

    const byName = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?search=middle%20success`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    expect(byName.data.map((trace) => trace.id)).toEqual([middleTraceId]);

    const byId = (
      await request(app.getHttpServer())
        .get(`/projects/${firstProjectId}/traces?search=${oldestTraceId}`)
        .set('Authorization', `Bearer ${firstAuth.accessToken}`)
        .expect(200)
    ).body as TraceListResponse;
    expect(byId.data.map((trace) => trace.id)).toEqual([oldestTraceId]);
  });

  it('returns a trace detail with stable, complete nested spans', async () => {
    const response = await request(app.getHttpServer())
      .get(`/traces/${newestTraceId}`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    const trace = response.body as TraceDetailResponse;

    expect(trace).toMatchObject({
      id: newestTraceId,
      projectId: firstProjectId,
      status: 'success',
      durationMs: 2000,
      inputTokens: 40,
      outputTokens: 20,
      totalTokens: 60,
      totalCost: '0.0045',
      metadata: { environment: 'test', order: 3 },
    });
    expect(trace.spans.map((span) => span.id)).toEqual([
      rootSpanId,
      childSpanId,
    ]);
    expect(trace.spans[0]).toMatchObject({
      parentSpanId: null,
      type: 'agent',
      latencyMs: 2000,
    });
    expect(trace.spans[1]).toMatchObject({
      traceId: newestTraceId,
      parentSpanId: rootSpanId,
      type: 'retrieval',
      status: 'failed',
      latencyMs: 400,
      input: { query: 'Agent observability' },
      output: { documents: 2 },
      inputTokens: 40,
      outputTokens: 20,
      estimatedCost: '0.0045',
      errorType: 'PartialResult',
      errorMessage: 'One source timed out',
    });
  });

  it('returns 404 when a non-member lists or directly gets tenant traces', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/traces`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/traces/${newestTraceId}`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/traces/${crossTenantTraceId}`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(404);
  });
});
