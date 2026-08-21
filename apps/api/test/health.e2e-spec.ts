import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health and request diagnostics (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('reports liveness and propagates a safe request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'health-check-123')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBe('health-check-123');
  });

  it('reports PostgreSQL readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });
});
