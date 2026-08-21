import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
}

interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

describe('Organizations and membership (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerAuth: AuthResponse;
  let otherAuth: AuthResponse;
  let ownerOrganizationId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const ownerEmail = `org-owner-${suffix}@example.com`;
  const otherEmail = `org-other-${suffix}@example.com`;
  const ownerSlug = `owner-${suffix}`;
  const otherSlug = `other-${suffix}`;

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
      where: { slug: { in: [ownerSlug, otherSlug] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });

    const ownerSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: ownerEmail, password })
      .expect(201);
    ownerAuth = ownerSignup.body as AuthResponse;

    const otherSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: otherEmail, password })
      .expect(201);
    otherAuth = otherSignup.body as AuthResponse;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { slug: { in: [ownerSlug, otherSlug] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
  });

  it('rejects unauthenticated organization requests', async () => {
    await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Unauthorized', slug: `unauthorized-${suffix}` })
      .expect(401);
    await request(app.getHttpServer()).get('/organizations').expect(401);
    await request(app.getHttpServer())
      .get(`/organizations/${randomUUID()}`)
      .expect(401);
  });

  it('creates an organization with a normalized slug', async () => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
      .send({
        name: '  Owner Organization  ',
        slug: `  ${ownerSlug.toUpperCase()}  `,
      })
      .expect(201);
    const organization = response.body as OrganizationResponse;

    expect(organization).toMatchObject({
      name: 'Owner Organization',
      slug: ownerSlug,
      plan: 'free',
      role: 'owner',
    });
    ownerOrganizationId = organization.id;
  });

  it('creates the owner membership atomically for the creator', async () => {
    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: ownerOrganizationId,
          userId: ownerAuth.user.id,
        },
      },
    });

    expect(membership.role).toBe('owner');
  });

  it('lists only organizations belonging to the current user', async () => {
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${otherAuth.accessToken}`)
      .send({ name: 'Other Organization', slug: otherSlug })
      .expect(201);

    const ownerResponse = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
      .expect(200);
    const ownerOrganizations = ownerResponse.body as OrganizationResponse[];

    expect(ownerOrganizations.map(({ slug }) => slug)).toContain(ownerSlug);
    expect(ownerOrganizations.map(({ slug }) => slug)).not.toContain(otherSlug);

    const otherResponse = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${otherAuth.accessToken}`)
      .expect(200);
    const otherOrganizations = otherResponse.body as OrganizationResponse[];

    expect(otherOrganizations.map(({ slug }) => slug)).toContain(otherSlug);
    expect(otherOrganizations.map(({ slug }) => slug)).not.toContain(ownerSlug);
  });

  it('rejects access when the user is not a member', () => {
    return request(app.getHttpServer())
      .get(`/organizations/${ownerOrganizationId}`)
      .set('Authorization', `Bearer ${otherAuth.accessToken}`)
      .expect(404);
  });

  it('allows any valid member role to access the organization', async () => {
    await prisma.organizationMember.create({
      data: {
        organizationId: ownerOrganizationId,
        userId: otherAuth.user.id,
        role: 'viewer',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/organizations/${ownerOrganizationId}`)
      .set('Authorization', `Bearer ${otherAuth.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: ownerOrganizationId,
      slug: ownerSlug,
      role: 'viewer',
    });
  });

  it('handles duplicate normalized slugs cleanly', async () => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
      .send({ name: 'Duplicate', slug: ` ${ownerSlug.toUpperCase()} ` })
      .expect(409);

    expect(response.body).toMatchObject({
      message: 'An organization with this slug already exists',
    });
  });
});
