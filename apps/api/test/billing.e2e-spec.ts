import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  BillingPlan,
  SubscriptionStatus,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
}

interface OrganizationResponse {
  id: string;
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
}

describe('Billing foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let firstAuth: AuthResponse;
  let secondAuth: AuthResponse;
  let firstOrganizationId: string;
  let secondOrganizationId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `billing-first-${suffix}@example.com`;
  const secondEmail = `billing-second-${suffix}@example.com`;
  const firstSlug = `billing-first-${suffix}`;
  const secondSlug = `billing-second-${suffix}`;

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
      where: { slug: { in: [firstSlug, secondSlug] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [firstEmail, secondEmail] } },
    });

    const firstSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: firstEmail, password })
      .expect(201);
    firstAuth = firstSignup.body as AuthResponse;

    const secondSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: secondEmail, password })
      .expect(201);
    secondAuth = secondSignup.body as AuthResponse;

    const firstOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'First Billing Organization', slug: firstSlug })
      .expect(201);
    firstOrganizationId = (firstOrganization.body as OrganizationResponse).id;

    const secondOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Billing Organization', slug: secondSlug })
      .expect(201);
    secondOrganizationId = (secondOrganization.body as OrganizationResponse).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { slug: { in: [firstSlug, secondSlug] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [firstEmail, secondEmail] } },
    });
    await app.close();
  }, 30_000);

  it('gives every new organization the safe default billing state', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: firstOrganizationId },
      select: {
        plan: true,
        subscriptionStatus: true,
        billingProvider: true,
        externalBillingCustomerId: true,
        externalBillingSubscriptionId: true,
      },
    });

    expect(organization).toEqual({
      plan: BillingPlan.free,
      subscriptionStatus: SubscriptionStatus.none,
      billingProvider: null,
      externalBillingCustomerId: null,
      externalBillingSubscriptionId: null,
    });
  });

  it('keeps billing state isolated by organization', async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${firstOrganizationId}`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);

    await prisma.organization.update({
      where: { id: firstOrganizationId },
      data: {
        plan: BillingPlan.pro,
        subscriptionStatus: SubscriptionStatus.active,
        billingProvider: 'test-provider',
        externalBillingCustomerId: `customer-${suffix}`,
        externalBillingSubscriptionId: `subscription-${suffix}`,
      },
    });

    const secondOrganization = await prisma.organization.findUniqueOrThrow({
      where: { id: secondOrganizationId },
      select: {
        plan: true,
        subscriptionStatus: true,
        billingProvider: true,
        externalBillingCustomerId: true,
        externalBillingSubscriptionId: true,
      },
    });

    expect(secondOrganization).toEqual({
      plan: BillingPlan.free,
      subscriptionStatus: SubscriptionStatus.none,
      billingProvider: null,
      externalBillingCustomerId: null,
      externalBillingSubscriptionId: null,
    });
  });

  it('rejects unsupported plan and subscription status values in the database', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "organizations" SET "plan" = $1 WHERE "id" = $2::uuid',
        'enterprise',
        firstOrganizationId,
      ),
    ).rejects.toThrow();

    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "organizations" SET "subscription_status" = $1 WHERE "id" = $2::uuid',
        'expired',
        firstOrganizationId,
      ),
    ).rejects.toThrow();
  });

  it('exposes the migrated provider-neutral columns and enum defaults', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ column_name: string; column_default: string | null }>
    >`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name IN (
          'plan',
          'subscription_status',
          'billing_provider',
          'external_billing_customer_id',
          'external_billing_subscription_id',
          'stripe_customer_id'
        )
    `;
    const byName = new Map(
      columns.map(({ column_name, column_default }) => [
        column_name,
        column_default,
      ]),
    );

    expect([...byName.keys()].sort()).toEqual([
      'billing_provider',
      'external_billing_customer_id',
      'external_billing_subscription_id',
      'plan',
      'subscription_status',
    ]);
    expect(byName.get('plan')).toContain("'free'");
    expect(byName.get('subscription_status')).toContain("'none'");
  });
});
