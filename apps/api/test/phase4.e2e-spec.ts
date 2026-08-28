import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { BillingService } from './../src/billing/billing.service';
import {
  BillingPlan,
  SubscriptionStatus,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';
import { IngestionService } from './../src/ingestion/ingestion.service';

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
}

interface IdResponse {
  id: string;
}

describe('Phase 4 monetization and organization management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let billing: BillingService;
  let ingestion: IngestionService;
  let organizationId: string;
  let owner: AuthResponse;
  let admin: AuthResponse;
  let member: AuthResponse;
  let invitee: AuthResponse;
  let outsider: AuthResponse;
  let adminMembershipId: string;
  let memberMembershipId: string;
  let projectId: string;
  let inviteToken: string;
  const usageTraceId = randomUUID();
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const organizationSlug = `phase4-${suffix}`;
  const emails = {
    owner: `phase4-owner-${suffix}@example.com`,
    admin: `phase4-admin-${suffix}@example.com`,
    member: `phase4-member-${suffix}@example.com`,
    invitee: `phase4-invitee-${suffix}@example.com`,
    outsider: `phase4-outsider-${suffix}@example.com`,
  };
  const originalStripeEnvironment = {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    proPriceId: process.env.STRIPE_PRO_PRICE_ID,
    webUrl: process.env.AGENTPULSE_WEB_URL,
  };

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.AGENTPULSE_WEB_URL;

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
    billing = app.get(BillingService);
    ingestion = app.get(IngestionService);

    for (const email of Object.values(emails)) {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(201);
      const auth = response.body as AuthResponse;
      if (email === emails.owner) owner = auth;
      if (email === emails.admin) admin = auth;
      if (email === emails.member) member = auth;
      if (email === emails.invitee) invitee = auth;
      if (email === emails.outsider) outsider = auth;
    }

    const organization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', bearer(owner))
      .send({ name: 'Phase 4 Organization', slug: organizationSlug })
      .expect(201);
    organizationId = (organization.body as IdResponse).id;

    const [adminMembership, memberMembership] =
      await prisma.organizationMember.createManyAndReturn({
        data: [
          { organizationId, userId: admin.user.id, role: 'admin' },
          { organizationId, userId: member.user.id, role: 'member' },
        ],
      });
    adminMembershipId = adminMembership.id;
    memberMembershipId = memberMembership.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.billingWebhookEvent.deleteMany({
      where: { externalEventId: { startsWith: `evt_phase4_${suffix}` } },
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await app.close();
    restoreEnvironment(
      'STRIPE_SECRET_KEY',
      originalStripeEnvironment.secretKey,
    );
    restoreEnvironment(
      'STRIPE_WEBHOOK_SECRET',
      originalStripeEnvironment.webhookSecret,
    );
    restoreEnvironment(
      'STRIPE_PRO_PRICE_ID',
      originalStripeEnvironment.proPriceId,
    );
    restoreEnvironment('AGENTPULSE_WEB_URL', originalStripeEnvironment.webUrl);
  }, 30_000);

  it('fails Stripe actions safely when unconfigured and preserves auth semantics', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/billing/checkout`)
      .set('Authorization', bearer(owner))
      .expect(503)
      .expect(({ body }) => {
        expect((body as { message: string }).message).toContain(
          'Stripe billing is not configured',
        );
      });
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/billing/checkout`)
      .set('Authorization', bearer(member))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/billing/checkout`)
      .set('Authorization', bearer(outsider))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/billing/checkout`)
      .expect(401);
  });

  it('enforces organization settings RBAC without cross-tenant disclosure', async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}`)
      .set('Authorization', bearer(admin))
      .send({ name: 'Updated Phase 4 Organization' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: organizationId,
          name: 'Updated Phase 4 Organization',
          role: 'admin',
        });
      });

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}`)
      .set('Authorization', bearer(member))
      .send({ name: 'Forbidden update' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}`)
      .set('Authorization', bearer(outsider))
      .send({ name: 'Hidden organization' })
      .expect(404);
  });

  it('enforces the Free project limit and leaves Pro unlimited', async () => {
    const firstProject = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', bearer(owner))
      .send({ name: 'First Project', slug: `first-${suffix}` })
      .expect(201);
    projectId = (firstProject.body as IdResponse).id;

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', bearer(owner))
      .send({ name: 'Limited Project', slug: `limited-${suffix}` })
      .expect(402)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'PLAN_LIMIT_EXCEEDED',
          resource: 'projects',
          limit: 1,
        });
      });

    await prisma.organization.update({
      where: { id: organizationId },
      data: { plan: BillingPlan.pro },
    });
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', bearer(owner))
      .send({ name: 'Pro Project', slug: `pro-${suffix}` })
      .expect(201);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { plan: BillingPlan.free },
    });
  });

  it('creates hashed invites, prevents admin escalation, and enforces member limits', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/invites`)
      .set('Authorization', bearer(admin))
      .send({ email: invitee.user.email, role: 'admin' })
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/invites`)
      .set('Authorization', bearer(owner))
      .send({ email: invitee.user.email, role: 'viewer' })
      .expect(201);
    const acceptPath = (response.body as { acceptPath: string }).acceptPath;
    inviteToken = new URL(acceptPath, 'http://localhost').searchParams.get(
      'token',
    )!;

    const stored = await prisma.organizationInvite.findUniqueOrThrow({
      where: {
        organizationId_email: {
          organizationId,
          email: invitee.user.email,
        },
      },
    });
    expect(stored.tokenDigest).not.toBe(inviteToken);
    expect(stored.tokenDigest).toMatch(/^[0-9a-f]{64}$/);

    await request(app.getHttpServer())
      .post('/organization-invites/accept')
      .set('Authorization', bearer(invitee))
      .send({ token: inviteToken })
      .expect(402);

    await prisma.organization.update({
      where: { id: organizationId },
      data: { plan: BillingPlan.pro },
    });
    await request(app.getHttpServer())
      .post('/organization-invites/accept')
      .set('Authorization', bearer(invitee))
      .send({ token: inviteToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/organization-invites/accept')
      .set('Authorization', bearer(invitee))
      .send({ token: inviteToken })
      .expect(404);
  });

  it('protects owners and prevents cross-tenant member management', async () => {
    const ownerMembership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId,
          userId: owner.user.id,
        },
      },
    });
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/members/${ownerMembership.id}`)
      .set('Authorization', bearer(owner))
      .send({ role: 'admin' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/members/${adminMembershipId}`)
      .set('Authorization', bearer(admin))
      .send({ role: 'owner' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationId}/members/${memberMembershipId}`)
      .set('Authorization', bearer(outsider))
      .expect(404);
  });

  it('reports exact organization usage without exposing billing identifiers', async () => {
    const now = new Date();
    await prisma.trace.create({
      data: {
        id: usageTraceId,
        projectId,
        agentName: 'phase4-usage-agent',
        status: 'success',
        startedAt: now,
        endedAt: now,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/billing`)
      .set('Authorization', bearer(member))
      .expect(200);
    expect(response.body).toMatchObject({
      organizationId,
      plan: 'pro',
      usage: { projects: 2, members: 4, traces: 1 },
      entitlements: {
        projectLimit: null,
        organizationMemberLimit: null,
        monthlyTraceLimit: null,
      },
      stripe: { checkoutAvailable: false, portalAvailable: false },
    });
    expect(response.body).not.toHaveProperty('externalBillingCustomerId');
    expect(response.body).not.toHaveProperty('externalBillingSubscriptionId');
  });

  it('synchronizes signed subscription lifecycle data idempotently', async () => {
    process.env.STRIPE_PRO_PRICE_ID = `price_phase4_${suffix}`;
    const activeEvent = subscriptionEvent({
      eventId: `evt_phase4_${suffix}_active`,
      organizationId,
      priceId: process.env.STRIPE_PRO_PRICE_ID,
      status: 'active',
    });

    await expect(
      billing.processStripeEvent(activeEvent),
    ).resolves.toMatchObject({
      received: true,
      duplicate: false,
      organizationId,
    });
    await expect(
      billing.processStripeEvent(activeEvent),
    ).resolves.toMatchObject({
      received: true,
      duplicate: true,
      organizationId,
    });
    expect(
      await prisma.billingWebhookEvent.count({
        where: { externalEventId: activeEvent.id },
      }),
    ).toBe(1);

    const active = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(active).toMatchObject({
      plan: BillingPlan.pro,
      subscriptionStatus: SubscriptionStatus.active,
      billingProvider: 'stripe',
      externalBillingCustomerId: `cus_phase4_${suffix}`,
      externalBillingSubscriptionId: `sub_phase4_${suffix}`,
      cancelAtPeriodEnd: false,
    });

    await billing.processStripeEvent(
      subscriptionEvent({
        eventId: `evt_phase4_${suffix}_past_due`,
        organizationId,
        priceId: process.env.STRIPE_PRO_PRICE_ID,
        status: 'past_due',
      }),
    );
    expect(
      await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { plan: true, subscriptionStatus: true },
      }),
    ).toEqual({
      plan: BillingPlan.pro,
      subscriptionStatus: SubscriptionStatus.past_due,
    });

    await billing.processStripeEvent(
      subscriptionEvent({
        eventId: `evt_phase4_${suffix}_canceled`,
        organizationId,
        priceId: process.env.STRIPE_PRO_PRICE_ID,
        status: 'canceled',
      }),
    );
    expect(
      await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { plan: true, subscriptionStatus: true },
      }),
    ).toEqual({
      plan: BillingPlan.free,
      subscriptionStatus: SubscriptionStatus.canceled,
    });
  });

  it('enforces persisted trace usage without charging idempotent retries', async () => {
    await prisma.$executeRaw`
      INSERT INTO "traces" ("project_id", "agent_name", "status", "started_at")
      SELECT ${projectId}::uuid, 'phase4-limit-agent', 'success', CURRENT_TIMESTAMP
      FROM generate_series(1, 9999)
    `;

    await expect(
      ingestion.ingest(projectId, telemetryPayload(usageTraceId)),
    ).resolves.toMatchObject({ traceId: usageTraceId });

    const rejectedTraceId = randomUUID();
    await expect(
      ingestion.ingest(projectId, telemetryPayload(rejectedTraceId)),
    ).rejects.toMatchObject({
      status: 402,
      response: {
        code: 'PLAN_LIMIT_EXCEEDED',
        resource: 'monthly_traces',
        limit: 10_000,
      },
    });
    expect(await prisma.trace.count({ where: { id: rejectedTraceId } })).toBe(
      0,
    );
  });
});

function bearer(auth: AuthResponse): string {
  return `Bearer ${auth.accessToken}`;
}

function subscriptionEvent(input: {
  eventId: string;
  organizationId: string;
  priceId: string;
  status: Stripe.Subscription.Status;
}): Stripe.Event {
  const suffix = input.eventId.slice(
    'evt_phase4_'.length,
    -(input.status.length + 1),
  );
  return {
    id: input.eventId,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_phase4_${suffix}`,
        object: 'subscription',
        customer: `cus_phase4_${suffix}`,
        metadata: { organizationId: input.organizationId },
        status: input.status,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: input.priceId },
              current_period_start: Math.floor(Date.now() / 1000) - 60,
              current_period_end: Math.floor(Date.now() / 1000) + 2_592_000,
            },
          ],
        },
      } as Stripe.Subscription,
    },
  } as Stripe.Event;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function telemetryPayload(id: string) {
  const timestamp = new Date().toISOString();
  return {
    id,
    agentName: 'phase4-limit-agent',
    status: 'success',
    startedAt: timestamp,
    endedAt: timestamp,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: '0',
    metadata: {},
    spans: [],
  };
}
