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
}

interface ProjectResponse {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}

describe('Projects and tenant authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let firstAuth: AuthResponse;
  let secondAuth: AuthResponse;
  let firstOrganizationId: string;
  let secondOrganizationId: string;
  let firstProjectId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `project-first-${suffix}@example.com`;
  const secondEmail = `project-second-${suffix}@example.com`;
  const firstOrganizationSlug = `project-first-${suffix}`;
  const secondOrganizationSlug = `project-second-${suffix}`;
  const sharedProjectSlug = `shared-${suffix}`;

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
      .send({ name: 'First Organization', slug: firstOrganizationSlug })
      .expect(201);
    firstOrganizationId = (firstOrganization.body as OrganizationResponse).id;

    const secondOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Organization', slug: secondOrganizationSlug })
      .expect(201);
    secondOrganizationId = (secondOrganization.body as OrganizationResponse).id;
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

  it('rejects unauthenticated requests on every project route', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .send({ name: 'Unauthorized', slug: `unauthorized-${suffix}` })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/organizations/${firstOrganizationId}/projects`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${randomUUID()}`)
      .expect(401);
  });

  it('allows a member to create a normalized project', async () => {
    const response = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({
        name: '  First Project  ',
        slug: ` ${sharedProjectSlug.toUpperCase()} `,
        description: '  Tenant-scoped project  ',
      })
      .expect(201);
    const project = response.body as ProjectResponse;

    expect(project).toMatchObject({
      organizationId: firstOrganizationId,
      name: 'First Project',
      slug: sharedProjectSlug,
      description: 'Tenant-scoped project',
    });
    firstProjectId = project.id;
  });

  it('persists the project under exactly the authorized organization', async () => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: firstProjectId },
    });

    expect(project.organizationId).toBe(firstOrganizationId);
  });

  it('rejects non-members on nested create and list routes', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Cross Tenant', slug: `cross-${suffix}` })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
  });

  it('lists only projects from the authorized organization', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${secondOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Project', slug: sharedProjectSlug })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    const projects = response.body as ProjectResponse[];

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: firstProjectId,
      organizationId: firstOrganizationId,
    });
  });

  it('allows a member of the owning organization to get a project', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: firstProjectId,
      organizationId: firstOrganizationId,
    });
  });

  it('returns 404 for a cross-tenant project lookup', () => {
    return request(app.getHttpServer())
      .get(`/projects/${firstProjectId}`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
  });
});
