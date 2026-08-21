import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = randomUUID();
  const email = `auth-${suffix}@example.com`;
  const submittedEmail = `  AUTH-${suffix}@Example.COM  `;
  const password = 'CorrectHorseBatteryStaple!42';

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
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('signs up with a normalized email and stores only a password hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: submittedEmail,
        password,
        displayName: 'Test User',
      })
      .expect(201);
    const body = response.body as AuthResponse;

    expect(body.user.email).toBe(email);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { email },
    });
    expect(storedUser.passwordHash).not.toBe(password);
    expect(storedUser.passwordHash).toMatch(/^\$argon2id\$/);
    expect(storedUser.refreshTokenHash).not.toBe(body.refreshToken);
  });

  it('returns a clean conflict for a duplicate email', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, password })
      .expect(409);
  });

  it('logs in with normalized email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: submittedEmail, password })
      .expect(200);
    const body = response.body as AuthResponse;

    expect(body.user.email).toBe(email);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'DefinitelyTheWrongPassword' })
      .expect(401);

    expect(response.body).toMatchObject({
      message: 'Invalid email or password',
    });
  });

  it('protects GET /me and returns the authenticated user', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const auth = loginResponse.body as AuthResponse;

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: auth.user.id, email });
  });

  it('rotates refresh tokens and rejects replay of the old token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const original = loginResponse.body as AuthResponse;

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(200);
    const rotated = refreshResponse.body as Pick<
      AuthResponse,
      'accessToken' | 'refreshToken'
    >;

    expect(rotated.accessToken).not.toBe(original.accessToken);
    expect(rotated.refreshToken).not.toBe(original.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200);
  });

  it('revokes the active refresh token on logout', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const auth = loginResponse.body as AuthResponse;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: auth.refreshToken })
      .expect(204);

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
    });
    expect(storedUser.refreshTokenHash).toBeNull();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: auth.refreshToken })
      .expect(204);
  });
});
