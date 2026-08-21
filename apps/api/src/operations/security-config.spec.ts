import { corsOrigins, isAllowedOutboundUrl } from './security-config';

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
});
