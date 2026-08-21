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

interface OrganizationResponse {
  id: string;
}

interface ProjectResponse {
  id: string;
}

interface AlertRuleResponse {
  id: string;
  projectId: string;
  name: string;
  type: string;
  threshold: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

describe('Alert rules and tenant authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let firstAccessToken: string;
  let secondAccessToken: string;
  let firstProjectId: string;
  let secondProjectId: string;
  let alertRuleId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `alert-first-${suffix}@example.com`;
  const secondEmail = `alert-second-${suffix}@example.com`;
  const firstOrganizationSlug = `alert-first-${suffix}`;
  const secondOrganizationSlug = `alert-second-${suffix}`;

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

    const firstSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: firstEmail, password })
      .expect(201);
    firstAccessToken = (firstSignup.body as AuthResponse).accessToken;

    const secondSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: secondEmail, password })
      .expect(201);
    secondAccessToken = (secondSignup.body as AuthResponse).accessToken;

    const firstOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'Alert First', slug: firstOrganizationSlug })
      .expect(201);
    const firstOrganizationId = (firstOrganization.body as OrganizationResponse)
      .id;

    const secondOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Alert Second', slug: secondOrganizationSlug })
      .expect(201);
    const secondOrganizationId = (
      secondOrganization.body as OrganizationResponse
    ).id;

    const firstProject = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'First Project', slug: `first-${suffix}` })
      .expect(201);
    firstProjectId = (firstProject.body as ProjectResponse).id;

    const secondProject = await request(app.getHttpServer())
      .post(`/organizations/${secondOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Second Project', slug: `second-${suffix}` })
      .expect(201);
    secondProjectId = (secondProject.body as ProjectResponse).id;
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

  it('rejects unauthenticated access on every alert-rule route', async () => {
    const unknownId = randomUUID();

    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/alert-rules`)
      .send({ name: 'Unauthorized', type: 'cost', threshold: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/alert-rules`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/alert-rules/${unknownId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/alert-rules/${unknownId}`)
      .send({ enabled: false })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/alert-rules/${unknownId}`)
      .expect(401);
  });

  it('rejects invalid types and type-specific thresholds', async () => {
    const endpoint = `/projects/${firstProjectId}/alert-rules`;

    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'Unknown', type: 'token_usage', threshold: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'Zero cost', type: 'cost', threshold: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'Rate over one', type: 'error_rate', threshold: 1.01 })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({
        name: 'Fractional milliseconds',
        type: 'latency',
        threshold: 10.5,
      })
      .expect(400);
  });

  it('allows a member to create, list, and get an alert rule', async () => {
    const creation = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/alert-rules`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({
        name: '  Elevated error rate  ',
        type: 'error_rate',
        threshold: 0.25,
      })
      .expect(201);
    const created = creation.body as AlertRuleResponse;
    alertRuleId = created.id;

    expect(created).toMatchObject({
      projectId: firstProjectId,
      name: 'Elevated error rate',
      type: 'error_rate',
      threshold: '0.25',
      enabled: true,
    });
    expect(created.createdAt).toEqual(expect.any(String));
    expect(created.updatedAt).toEqual(expect.any(String));

    const listing = await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/alert-rules`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(200);
    expect(listing.body).toEqual([
      expect.objectContaining({ id: alertRuleId }),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({ id: alertRuleId });
  });

  it('updates and enables or disables an alert rule', async () => {
    const disabled = await request(app.getHttpServer())
      .patch(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ enabled: false })
      .expect(200);
    expect(disabled.body).toMatchObject({ enabled: false });

    const updated = await request(app.getHttpServer())
      .patch(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({
        name: 'Slow operation',
        type: 'latency',
        threshold: 1500,
        enabled: true,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Slow operation',
      type: 'latency',
      threshold: '1500',
      enabled: true,
    });

    await request(app.getHttpServer())
      .patch(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({})
      .expect(400);
  });

  it('returns 404 when a non-member manages another project or rule', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/alert-rules`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Cross tenant', type: 'cost', threshold: 2 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/alert-rules`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ enabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(404);

    expect(await prisma.alertRule.count({ where: { id: alertRuleId } })).toBe(
      1,
    );
    expect(secondProjectId).not.toBe(firstProjectId);
  });

  it('allows a member to delete an alert rule', async () => {
    await request(app.getHttpServer())
      .delete(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/alert-rules/${alertRuleId}`)
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(404);
    expect(await prisma.alertRule.count({ where: { id: alertRuleId } })).toBe(
      0,
    );
  });
});
