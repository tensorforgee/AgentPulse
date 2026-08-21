import { HttpException } from '@nestjs/common';
import { RATE_LIMIT_POLICY } from './rate-limit.constants';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const originalLoginMax = process.env.RATE_LIMIT_AUTH_LOGIN_MAX;
  const originalIngestMax = process.env.RATE_LIMIT_INGEST_MAX;

  beforeEach(() => {
    process.env.RATE_LIMIT_AUTH_LOGIN_MAX = '2';
    process.env.RATE_LIMIT_INGEST_MAX = '2';
  });

  afterEach(() => {
    restoreEnvironment('RATE_LIMIT_AUTH_LOGIN_MAX', originalLoginMax);
    restoreEnvironment('RATE_LIMIT_INGEST_MAX', originalIngestMax);
  });

  it('allows requests through the limit and returns 429 when exceeded', () => {
    const service = new RateLimitService();

    service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-a');
    service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-a');

    try {
      service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-a');
      throw new Error('Expected the rate limit to be exceeded');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      const response = (error as HttpException).getResponse() as {
        message?: unknown;
        retryAfterSeconds?: unknown;
      };
      expect(response.message).toBe('Too many requests');
      expect(response.retryAfterSeconds).toEqual(expect.any(Number));
    }
  });

  it('isolates buckets for different clients and API-key identities', () => {
    const service = new RateLimitService();

    service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-a');
    service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-a');
    expect(() =>
      service.assertAllowed(RATE_LIMIT_POLICY.authLogin, 'ip:client-b'),
    ).not.toThrow();

    service.assertAllowed(
      RATE_LIMIT_POLICY.ingestion,
      'project:one:api-key:key-a',
    );
    service.assertAllowed(
      RATE_LIMIT_POLICY.ingestion,
      'project:one:api-key:key-a',
    );
    expect(() =>
      service.assertAllowed(
        RATE_LIMIT_POLICY.ingestion,
        'project:one:api-key:key-b',
      ),
    ).not.toThrow();
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
