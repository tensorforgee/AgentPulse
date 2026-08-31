import {
  corsOrigins,
  isAllowedOutboundUrl,
  validateTenantWebhookUrl,
} from './security-config';

describe('production transport security configuration', () => {
  it('requires exact HTTPS CORS origins in production', () => {
    expect(corsOrigins('https://app.example.com', 'production')).toEqual([
      'https://app.example.com',
    ]);
    expect(() => corsOrigins(undefined, 'production')).toThrow(
      'CORS_ORIGINS is required in production',
    );
    expect(() => corsOrigins('http://app.example.com', 'production')).toThrow(
      'use HTTPS in production',
    );
    expect(() =>
      corsOrigins('https://app.example.com/path', 'production'),
    ).toThrow('exact HTTP(S) origins');
  });

  it('allows plaintext outbound URLs only for local development and tests', () => {
    expect(
      isAllowedOutboundUrl(new URL('https://hooks.example.com'), 'production'),
    ).toBe(true);
    expect(
      isAllowedOutboundUrl(new URL('http://hooks.example.com'), 'production'),
    ).toBe(false);
    expect(isAllowedOutboundUrl(new URL('http://mock.local'), 'test')).toBe(
      true,
    );
    expect(
      isAllowedOutboundUrl(
        new URL('https://user:password@hooks.example.com'),
        'production',
      ),
    ).toBe(false);
  });

  it('rejects tenant webhook loopback, private, link-local, and metadata targets', async () => {
    for (const value of [
      'https://localhost/hooks',
      'https://127.0.0.1/hooks',
      'https://10.0.0.1/hooks',
      'https://172.16.0.1/hooks',
      'https://192.168.1.1/hooks',
      'https://169.254.169.254/latest/meta-data',
      'https://100.100.100.200/latest/meta-data',
      'https://[::1]/hooks',
      'https://[fd00:ec2::254]/hooks',
      'https://metadata.google.internal/computeMetadata/v1',
      'http://hooks.example.com/insecure',
      'https://user:secret@hooks.example.com/path',
    ]) {
      await expect(
        validateTenantWebhookUrl(value, 'production'),
      ).rejects.toThrow();
    }
  });

  it('fails closed when production DNS resolves to a non-public address', async () => {
    await expect(
      validateTenantWebhookUrl(
        'https://hooks.example.com/agentpulse',
        'production',
        () => Promise.resolve([{ address: '10.0.0.8' }]),
      ),
    ).rejects.toThrow('target is not allowed');

    await expect(
      validateTenantWebhookUrl(
        'https://hooks.example.com/agentpulse',
        'production',
        () => Promise.resolve([{ address: '203.0.114.10' }]),
      ),
    ).resolves.toBeInstanceOf(URL);
  });
});
