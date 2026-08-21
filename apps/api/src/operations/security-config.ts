const LOCAL_ENVIRONMENTS = new Set(['development', 'test']);

export function corsOrigins(
  configuredValue: string | undefined,
  environment: string | undefined,
): string[] {
  const configured = configuredValue
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configured?.length) {
    if (environment === 'production') {
      throw new Error('CORS_ORIGINS is required in production');
    }
    return ['http://localhost:3000'];
  }

  return configured.map((origin) => {
    try {
      const parsed = new URL(origin);
      const allowedProtocol =
        parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && environment !== 'production');

      if (!allowedProtocol || parsed.origin !== origin) {
        throw new Error();
      }
      return origin;
    } catch {
      throw new Error(
        'CORS_ORIGINS must contain exact HTTP(S) origins and use HTTPS in production',
      );
    }
  });
}

export function isAllowedOutboundUrl(
  url: URL,
  environment = process.env.NODE_ENV,
): boolean {
  if (url.username || url.password) {
    return false;
  }
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOCAL_ENVIRONMENTS.has(environment ?? ''))
  );
}
