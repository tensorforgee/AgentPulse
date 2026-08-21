import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PostIngestProcessorService } from './../src/ingestion/post-ingest-processor.service';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

interface IdResponse {
  id: string;
}

interface ApiKeyResponse extends IdResponse {
  key: string;
}

const RATE_LIMIT_ENVIRONMENT = {
  RATE_LIMIT_AUTH_SIGNUP_MAX: '2',
  RATE_LIMIT_AUTH_LOGIN_MAX: '2',
  RATE_LIMIT_AUTH_REFRESH_MAX: '2',
  RATE_LIMIT_AUTH_WINDOW_MS: '60000',
  RATE_LIMIT_API_KEY_INVALID_MAX: '2',
  RATE_LIMIT_API_KEY_INVALID_WINDOW_MS: '60000',
  RATE_LIMIT_INGEST_MAX: '2',
  RATE_LIMIT_INGEST_WINDOW_MS: '60000',
} as const;

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let postIngest: PostIngestProcessorService;
  let auth: AuthResponse;
  let firstProjectId: string;
  let firstApiKey: string;
  let secondApiKey: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const primaryEmail = `rate-primary-${suffix}@example.com`;
  const secondaryEmail = `rate-secondary-${suffix}@example.com`;
  const organizationSlug = `rate-limit-${suffix}`;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const [name, value] of Object.entries(RATE_LIMIT_ENVIRONMENT)) {
      originalEnvironment.set(name, process.env[name]);
      process.env[name] = value;
    }

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

    await prisma.organization.deleteMany({ where: { slug: organizationSlug } });
    await prisma.user.deleteMany({
      where: { email: { in: [primaryEmail, secondaryEmail] } },
    });

    auth = (
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: primaryEmail, password })
        .expect(201)
    ).body as AuthResponse;

    const organization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: 'Rate Limit Organization', slug: organizationSlug })
      .expect(201);
    const organizationId = (organization.body as IdResponse).id;

    const project = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: 'Rate Limit Project', slug: 'rate-limit-project' })
      .expect(201);
    firstProjectId = (project.body as IdResponse).id;

    const firstKeyResponse = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: 'First rate-limit key' })
      .expect(201);
    firstApiKey = (firstKeyResponse.body as ApiKeyResponse).key;
    const secondKeyResponse = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: 'Second rate-limit key' })
      .expect(201);
    secondApiKey = (secondKeyResponse.body as ApiKeyResponse).key;
  });

  afterAll(async () => {
    await postIngest.waitForIdle();
    await prisma.organization.deleteMany({ where: { slug: organizationSlug } });
    await prisma.user.deleteMany({
      where: { email: { in: [primaryEmail, secondaryEmail] } },
    });
    await app.close();
    for (const [name, value] of originalEnvironment) {
      restoreEnvironment(name, value);
    }
  });

  it('rate limits signup, login, and refresh by client IP', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: secondaryEmail, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: `rate-extra-${suffix}@example.com`, password })
      .expect(429);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: primaryEmail, password })
      .expect(200);
    const latestLogin = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: primaryEmail, password })
        .expect(200)
    ).body as AuthResponse;
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: primaryEmail, password })
      .expect(429);

    const firstRefresh = (
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: latestLogin.refreshToken })
        .expect(200)
    ).body as AuthResponse;
    const secondRefresh = (
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh.refreshToken })
        .expect(200)
    ).body as AuthResponse;
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: secondRefresh.refreshToken })
      .expect(429);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: secondRefresh.refreshToken })
      .expect(429);
  });

  it('rate limits repeated invalid API-key authentication attempts', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const invalidKey = `ap_live_${randomBytes(6).toString('base64url')}_${randomBytes(32).toString('base64url')}`;
      await request(app.getHttpServer())
        .post('/v1/ingest')
        .set('Authorization', `Bearer ${invalidKey}`)
        .send(tracePayload(randomUUID()))
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', 'Bearer malformed')
      .send(tracePayload(randomUUID()))
      .expect(429);
  });

  it('limits ingestion per API key without changing idempotency', async () => {
    const firstTraceId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${firstApiKey}`)
      .send(tracePayload(firstTraceId))
      .expect(202);
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${firstApiKey}`)
      .send(tracePayload(firstTraceId))
      .expect(202);
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${firstApiKey}`)
      .send(tracePayload(randomUUID()))
      .expect(429);

    const secondTraceId = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/ingest')
      .set('Authorization', `Bearer ${secondApiKey}`)
      .send(tracePayload(secondTraceId))
      .expect(202);

    expect(await prisma.trace.count({ where: { id: firstTraceId } })).toBe(1);
    expect(
      await prisma.trace.findUnique({
        where: { id: secondTraceId },
        select: { projectId: true },
      }),
    ).toEqual({ projectId: firstProjectId });
  });
});

function tracePayload(id: string) {
  return {
    id,
    agentName: 'rate-limit-agent',
    name: 'Rate limit trace',
    status: 'success',
    startedAt: '2026-08-21T12:00:00.000Z',
    endedAt: '2026-08-21T12:00:00.100Z',
    durationMs: 100,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    totalCost: '0.0001',
    spans: [],
  };
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
