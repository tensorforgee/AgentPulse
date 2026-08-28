export interface StripeBillingConfiguration {
  secretKey?: string;
  webhookSecret?: string;
  proPriceId?: string;
  webBaseUrl?: string;
}

function optionalValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function stripeBillingConfiguration(): StripeBillingConfiguration {
  return {
    secretKey: optionalValue('STRIPE_SECRET_KEY'),
    webhookSecret: optionalValue('STRIPE_WEBHOOK_SECRET'),
    proPriceId: optionalValue('STRIPE_PRO_PRICE_ID'),
    webBaseUrl: optionalValue('AGENTPULSE_WEB_URL'),
  };
}

export function checkoutConfigurationError(
  config: StripeBillingConfiguration,
): string | null {
  const missing = [
    !config.secretKey && 'STRIPE_SECRET_KEY',
    !config.proPriceId && 'STRIPE_PRO_PRICE_ID',
    !config.webBaseUrl && 'AGENTPULSE_WEB_URL',
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    return `Stripe billing is not configured: ${missing.join(', ')}`;
  }

  try {
    const url = new URL(config.webBaseUrl!);
    const isLocal =
      process.env.NODE_ENV !== 'production' && url.protocol === 'http:';
    if (
      url.username ||
      url.password ||
      url.origin !== config.webBaseUrl ||
      (url.protocol !== 'https:' && !isLocal)
    ) {
      throw new Error();
    }
  } catch {
    return 'AGENTPULSE_WEB_URL must be an exact HTTPS origin (HTTP is allowed locally)';
  }

  return null;
}

export function webhookConfigurationError(
  config: StripeBillingConfiguration,
): string | null {
  const missing = [
    !config.secretKey && 'STRIPE_SECRET_KEY',
    !config.webhookSecret && 'STRIPE_WEBHOOK_SECRET',
    !config.proPriceId && 'STRIPE_PRO_PRICE_ID',
  ].filter((name): name is string => Boolean(name));

  return missing.length
    ? `Stripe webhooks are not configured: ${missing.join(', ')}`
    : null;
}
