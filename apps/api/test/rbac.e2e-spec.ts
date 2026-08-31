import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { BillingPlan } from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface AuthResponse {
  user: { id: string };
  accessToken: string;
}

interface IdResponse {
  id: string;
}

interface WebhookResponse {
  url: string;
  signingSecret: string;
  signatureVersion: string;
}

describe('V1 organization RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let organizationId: string;
  let projectId: string;
  let traceId: string;
  let persistentApiKeyId: string;
  let persistentAlertRuleId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const organizationSlug = `rbac-${suffix}`;
  const authByRole = {} as Record<Role, AuthResponse>;
  let outsiderAuth: AuthResponse;
  const emails = {
    owner: `rbac-owner-${suffix}@example.com`,
    admin: `rbac-admin-${suffix}@example.com`,
    member: `rbac-member-${suffix}@example.com`,
    viewer: `rbac-viewer-${suffix}@example.com`,
    outsider: `rbac-outsider-${suffix}@example.com`,
  };
  const originalWebhookEncryptionKey = process.env.ALERT_WEBHOOK_ENCRYPTION_KEY;
  const originalWebhookMapping = process.env.ALERT_WEBHOOK_URLS_JSON;

  beforeAll(async () => {
    process.env.ALERT_WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString(
      'base64',
    );
    delete process.env.ALERT_WEBHOOK_URLS_JSON;
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

    for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: emails[role], password })
        .expect(201);
      authByRole[role] = response.body as AuthResponse;
    }
    outsiderAuth = (
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: emails.outsider, password })
        .expect(201)
    ).body as AuthResponse;

    organizationId = (
      (
        await request(app.getHttpServer())
          .post('/organizations')
          .set('Authorization', bearer(authByRole.owner))
          .send({ name: 'RBAC Organization', slug: organizationSlug })
          .expect(201)
      ).body as IdResponse
    ).id;

    // This suite exercises RBAC across repeated resource creation. Keep plan
    // enforcement orthogonal; Phase 4 limit behavior has dedicated coverage.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { plan: BillingPlan.pro },
    });

    await prisma.organizationMember.createMany({
      data: (['admin', 'member', 'viewer'] as const).map((role) => ({
        organizationId,
        userId: authByRole[role].user.id,
        role,
      })),
    });

    projectId = (
      (
        await request(app.getHttpServer())
          .post(`/organizations/${organizationId}/projects`)
          .set('Authorization', bearer(authByRole.owner))
          .send({ name: 'RBAC Project', slug: `rbac-project-${suffix}` })
          .expect(201)
      ).body as IdResponse
    ).id;

    traceId = randomUUID();
    await prisma.trace.create({
      data: {
        id: traceId,
        projectId,
        agentName: 'rbac-agent',
        name: 'RBAC readable trace',
        status: 'success',
        startedAt: new Date(),
      },
    });

    persistentApiKeyId = (
      (
        await request(app.getHttpServer())
          .post(`/projects/${projectId}/api-keys`)
          .set('Authorization', bearer(authByRole.owner))
          .send({ name: 'RBAC persistent key' })
          .expect(201)
      ).body as IdResponse
    ).id;
    persistentAlertRuleId = (
      (
        await request(app.getHttpServer())
          .post(`/projects/${projectId}/alert-rules`)
          .set('Authorization', bearer(authByRole.owner))
          .send({ name: 'RBAC persistent rule', type: 'cost', threshold: 1 })
          .expect(201)
      ).body as IdResponse
    ).id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: organizationSlug } });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await app.close();
    restoreEnvironment(
      'ALERT_WEBHOOK_ENCRYPTION_KEY',
      originalWebhookEncryptionKey,
    );
    restoreEnvironment('ALERT_WEBHOOK_URLS_JSON', originalWebhookMapping);
  });

  it('allows owners and admins to manage projects, API keys, and alert rules', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    for (const role of ['owner', 'admin'] as const) {
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/projects`)
        .set('Authorization', bearer(authByRole[role]))
        .send({
          name: `${role} managed project`,
          slug: `${role}-managed-${suffix}`,
        })
        .expect(201);

      const apiKeyId = (
        (
          await request(app.getHttpServer())
            .post(`/projects/${projectId}/api-keys`)
            .set('Authorization', bearer(authByRole[role]))
            .send({ name: `${role} managed key` })
            .expect(201)
        ).body as IdResponse
      ).id;
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/api-keys/${apiKeyId}/revoke`)
        .set('Authorization', bearer(authByRole[role]))
        .expect(200);

      const alertRuleId = (
        (
          await request(app.getHttpServer())
            .post(`/projects/${projectId}/alert-rules`)
            .set('Authorization', bearer(authByRole[role]))
            .send({
              name: `${role} managed rule`,
              type: 'latency',
              threshold: 1000,
            })
            .expect(201)
        ).body as IdResponse
      ).id;
      await request(app.getHttpServer())
        .patch(`/alert-rules/${alertRuleId}`)
        .set('Authorization', bearer(authByRole[role]))
        .send({ enabled: false })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/alert-rules/${alertRuleId}`)
        .set('Authorization', bearer(authByRole[role]))
        .expect(204);

      const webhook = await request(app.getHttpServer())
        .put(`/projects/${projectId}/alert-webhook`)
        .set('Authorization', bearer(authByRole[role]))
        .send({ url: `http://webhook.mock/${role}` })
        .expect(200);
      const webhookBody = webhook.body as WebhookResponse;
      expect(webhookBody).toMatchObject({
        url: `http://webhook.mock/${role}`,
        signatureVersion: 'v1',
      });
      expect(webhookBody.signingSecret).toMatch(/^whsec_/);
      const stored = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { alertWebhookSecretEncrypted: true },
      });
      expect(stored.alertWebhookSecretEncrypted).toMatch(/^v1\./);
      expect(stored.alertWebhookSecretEncrypted).not.toContain(
        webhookBody.signingSecret,
      );

      const status = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alert-webhook`)
        .set('Authorization', bearer(authByRole[role]))
        .expect(200);
      expect(status.body).toMatchObject({
        configured: true,
        source: 'project',
        signed: true,
      });
      expect(status.body).not.toHaveProperty('signingSecret');

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alert-webhook/test`)
        .set('Authorization', bearer(authByRole[role]))
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({ status: 'delivered', error: null });
        });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });

  it('allows every organization role to read projects and telemetry', async () => {
    for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
      const authorization = bearer(authByRole[role]);
      await request(app.getHttpServer())
        .get(`/organizations/${organizationId}/projects`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/traces`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/traces/${traceId}`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/alert-rules`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/alert-rules/${persistentAlertRuleId}`)
        .set('Authorization', authorization)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/api-keys`)
        .set('Authorization', authorization)
        .expect(200);
    }
  });

  it('rejects member and viewer management actions with 403', async () => {
    for (const role of ['member', 'viewer'] as const) {
      const authorization = bearer(authByRole[role]);
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/projects`)
        .set('Authorization', authorization)
        .send({ name: 'Forbidden project', slug: `${role}-${suffix}` })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/api-keys`)
        .set('Authorization', authorization)
        .send({ name: 'Forbidden key' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/api-keys/${persistentApiKeyId}/revoke`)
        .set('Authorization', authorization)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alert-rules`)
        .set('Authorization', authorization)
        .send({ name: 'Forbidden rule', type: 'cost', threshold: 1 })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/alert-rules/${persistentAlertRuleId}`)
        .set('Authorization', authorization)
        .send({ enabled: false })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/alert-rules/${persistentAlertRuleId}`)
        .set('Authorization', authorization)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/projects/${projectId}/alert-webhook`)
        .set('Authorization', authorization)
        .send({ url: 'http://webhook.mock/forbidden' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alert-webhook/test`)
        .set('Authorization', authorization)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/alert-webhook`)
        .set('Authorization', authorization)
        .expect(403);
    }

    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: persistentApiKeyId },
        select: { revokedAt: true },
      }),
    ).toEqual({ revokedAt: null });
    expect(
      await prisma.alertRule.count({ where: { id: persistentAlertRuleId } }),
    ).toBe(1);
  });

  it('preserves 404 responses for cross-tenant access', async () => {
    const authorization = bearer(outsiderAuth);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', authorization)
      .send({ name: 'Cross tenant', slug: `cross-${suffix}` })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/api-keys`)
      .set('Authorization', authorization)
      .send({ name: 'Cross tenant' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/alert-rules`)
      .set('Authorization', authorization)
      .send({ name: 'Cross tenant', type: 'cost', threshold: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/projects/${projectId}/alert-webhook`)
      .set('Authorization', authorization)
      .send({ url: 'http://webhook.mock/cross-tenant' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/alert-rules/${persistentAlertRuleId}`)
      .set('Authorization', authorization)
      .send({ enabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/traces`)
      .set('Authorization', authorization)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/traces/${traceId}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('preserves 401 responses for unauthenticated access', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .send({ name: 'Unauthenticated', slug: `unauth-${suffix}` })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/api-keys`)
      .send({ name: 'Unauthenticated' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/alert-rules`)
      .send({ name: 'Unauthenticated', type: 'cost', threshold: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .put(`/projects/${projectId}/alert-webhook`)
      .send({ url: 'http://webhook.mock/unauthenticated' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/traces`)
      .expect(401);
  });
});

function bearer(auth: AuthResponse): string {
  return `Bearer ${auth.accessToken}`;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
