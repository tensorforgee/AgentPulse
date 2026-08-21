import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyAuthService } from './../src/api-keys/api-key-auth.service';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  accessToken: string;
}

interface IdResponse {
  id: string;
}

interface ApiKeyResponse {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  key?: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  hashedKey?: string;
}

describe('Project API keys (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let apiKeyAuthService: ApiKeyAuthService;
  let firstAuth: AuthResponse;
  let secondAuth: AuthResponse;
  let firstProjectId: string;
  let secondProjectId: string;
  let plaintextKey: string;
  let apiKeyId: string;
  const suffix = randomUUID();
  const password = 'CorrectHorseBatteryStaple!42';
  const firstEmail = `key-first-${suffix}@example.com`;
  const secondEmail = `key-second-${suffix}@example.com`;
  const firstOrganizationSlug = `key-first-${suffix}`;
  const secondOrganizationSlug = `key-second-${suffix}`;

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
    apiKeyAuthService = app.get(ApiKeyAuthService);

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
      .send({ name: 'First Key Organization', slug: firstOrganizationSlug })
      .expect(201);
    const firstOrganizationId = (firstOrganization.body as IdResponse).id;

    const secondOrganization = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Key Organization', slug: secondOrganizationSlug })
      .expect(201);
    const secondOrganizationId = (secondOrganization.body as IdResponse).id;

    const firstProject = await request(app.getHttpServer())
      .post(`/organizations/${firstOrganizationId}/projects`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'First Key Project', slug: `key-project-${suffix}` })
      .expect(201);
    firstProjectId = (firstProject.body as IdResponse).id;

    const secondProject = await request(app.getHttpServer())
      .post(`/organizations/${secondOrganizationId}/projects`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Key Project', slug: `key-project-${suffix}` })
      .expect(201);
    secondProjectId = (secondProject.body as IdResponse).id;
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

  it('rejects unauthenticated API-key management', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .send({ name: 'Unauthorized' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/api-keys`)
      .expect(401);
  });

  it('allows a member to create a key and returns plaintext once', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: '  Production Ingestion  ' })
      .expect(201);
    const apiKey = response.body as ApiKeyResponse;

    expect(apiKey.projectId).toBe(firstProjectId);
    expect(apiKey.name).toBe('Production Ingestion');
    expect(apiKey.prefix).toMatch(/^ap_live_[A-Za-z0-9_-]{8}$/);
    expect(apiKey.key).toMatch(/^ap_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/);
    expect(apiKey).not.toHaveProperty('hashedKey');
    plaintextKey = apiKey.key as string;
    apiKeyId = apiKey.id;
  });

  it('stores only the digest and non-secret prefix', async () => {
    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: apiKeyId },
    });
    const expectedDigest = createHash('sha256')
      .update(plaintextKey, 'utf8')
      .digest('hex');

    expect(stored.hashedKey).toBe(expectedDigest);
    expect(stored.hashedKey).not.toBe(plaintextKey);
    expect(stored.prefix).toBe(plaintextKey.slice(0, 16));
  });

  it('lists metadata without returning plaintext or hashes', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    const keys = response.body as ApiKeyResponse[];

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      id: apiKeyId,
      prefix: plaintextKey.slice(0, 16),
    });
    expect(keys[0]).not.toHaveProperty('key');
    expect(keys[0]).not.toHaveProperty('hashedKey');
    expect(response.text).not.toContain(plaintextKey);
  });

  it('rejects non-members from managing another tenant key', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Cross Tenant' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys/${apiKeyId}/revoke`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);
  });

  it('does not trust an API-key id paired with a different project', async () => {
    const secondKeyResponse = await request(app.getHttpServer())
      .post(`/projects/${secondProjectId}/api-keys`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .send({ name: 'Second Tenant Key' })
      .expect(201);
    const secondKey = secondKeyResponse.body as ApiKeyResponse;

    await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys/${secondKey.id}/revoke`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(404);

    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: secondKey.id },
    });
    expect(stored.revokedAt).toBeNull();
  });

  it('authenticates a valid key and resolves its owning project', async () => {
    const access = await apiKeyAuthService.authenticate(plaintextKey);

    expect(access).toMatchObject({
      apiKeyId,
      project: { id: firstProjectId },
    });
    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: apiKeyId },
    });
    expect(stored.lastUsedAt).not.toBeNull();
  });

  it('rejects an invalid key', async () => {
    const invalidKey = `ap_live_${randomBytes(6).toString('base64url')}_${randomBytes(32).toString('base64url')}`;

    await expect(
      apiKeyAuthService.authenticate(invalidKey),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired key', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: 'Expiring Key' })
      .expect(201);
    const expiringKey = response.body as ApiKeyResponse;

    await prisma.apiKey.update({
      where: { id: expiringKey.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      apiKeyAuthService.authenticate(expiringKey.key as string),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes a key without returning its secret or hash', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${firstProjectId}/api-keys/${apiKeyId}/revoke`)
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    const revoked = response.body as ApiKeyResponse;

    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked).not.toHaveProperty('key');
    expect(revoked).not.toHaveProperty('hashedKey');
    expect(response.text).not.toContain(plaintextKey);
    await expect(
      apiKeyAuthService.authenticate(plaintextKey),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
