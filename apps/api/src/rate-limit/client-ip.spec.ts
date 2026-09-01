import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import request from 'supertest';
import { clientIp } from './rate-limit.service';

// Mirrors the production TRUST_PROXY_HOPS=1 setting applied in main.ts.
const TRUSTED_PROXY_HOPS = 1;

@Controller()
class ClientIpProbeController {
  @Get('probe')
  probe(@Req() incoming: Request) {
    return { clientIp: clientIp(incoming) };
  }
}

@Module({ controllers: [ClientIpProbeController] })
class ClientIpProbeModule {}

describe('client identity behind one trusted proxy hop', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      ClientIpProbeModule,
      { logger: false },
    );
    app.set('trust proxy', TRUSTED_PROXY_HOPS);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function resolvedClientIp(forwardedFor?: string): Promise<string> {
    const probe = request(app.getHttpServer()).get('/probe');
    if (forwardedFor !== undefined) {
      probe.set('x-forwarded-for', forwardedFor);
    }
    const response = await probe.expect(200);
    return (response.body as { clientIp: string }).clientIp;
  }

  it('resolves the agent address on the direct SDK path', async () => {
    // SDK -> Caddy -> API: Caddy sets the chain to the real client address.
    await expect(resolvedClientIp('203.0.113.7')).resolves.toBe('203.0.113.7');
  });

  it('resolves the same address on the browser path through web', async () => {
    // Browser -> Caddy -> web -> API: the web proxy replays Caddy's chain, so
    // the API sees the identical header and resolves the identical client.
    await expect(resolvedClientIp('203.0.113.7')).resolves.toBe('203.0.113.7');
  });

  it('uses the right-most entry when a chain arrives', async () => {
    await expect(resolvedClientIp('198.51.100.4, 203.0.113.7')).resolves.toBe(
      '203.0.113.7',
    );
  });

  it('distinguishes two clients that share one proxy hop', async () => {
    const [first, second] = await Promise.all([
      resolvedClientIp('203.0.113.7'),
      resolvedClientIp('203.0.113.9'),
    ]);
    expect(first).not.toBe(second);
  });

  it('falls back to the immediate peer when forwarding is dropped', async () => {
    // Regression guard: without the web proxy replaying x-forwarded-for, every
    // dashboard request collapses onto the web container address and shares one
    // rate-limit bucket.
    const resolved = await resolvedClientIp();
    expect(resolved).not.toBe('203.0.113.7');
    expect(resolved).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });
});
