import {
  checkoutConfigurationError,
  stripeBillingConfiguration,
  webhookConfigurationError,
} from './stripe-billing.config';

describe('Stripe billing configuration', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('fails closed with the missing variable names', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.AGENTPULSE_WEB_URL;
    const config = stripeBillingConfiguration();

    expect(checkoutConfigurationError(config)).toContain('STRIPE_SECRET_KEY');
    expect(checkoutConfigurationError(config)).toContain('STRIPE_PRO_PRICE_ID');
    expect(webhookConfigurationError(config)).toContain(
      'STRIPE_WEBHOOK_SECRET',
    );
  });

  it('accepts complete local configuration and rejects HTTP in production', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_PRO_PRICE_ID = 'price_example';
    process.env.AGENTPULSE_WEB_URL = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    expect(checkoutConfigurationError(stripeBillingConfiguration())).toBeNull();

    process.env.NODE_ENV = 'production';
    expect(checkoutConfigurationError(stripeBillingConfiguration())).toContain(
      'HTTPS',
    );
  });
});
