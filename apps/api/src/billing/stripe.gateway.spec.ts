import Stripe from 'stripe';
import { StripeGateway } from './stripe.gateway';

describe('StripeGateway webhook verification', () => {
  const gateway = new StripeGateway();
  const secretKey = 'sk_test_agentpulse';
  const webhookSecret = 'whsec_agentpulse_test';
  const payload = JSON.stringify({
    id: 'evt_agentpulse',
    object: 'event',
    api_version: null,
    created: 1_700_000_000,
    data: { object: {} },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'ping',
  });

  it('constructs an event only from a valid signature over the raw body', () => {
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    expect(
      gateway.constructWebhookEvent(
        secretKey,
        Buffer.from(payload),
        signature,
        webhookSecret,
      ),
    ).toMatchObject({ id: 'evt_agentpulse', type: 'ping' });
  });

  it('rejects a signature generated with another secret', () => {
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_wrong',
    });

    expect(() =>
      gateway.constructWebhookEvent(
        secretKey,
        Buffer.from(payload),
        signature,
        webhookSecret,
      ),
    ).toThrow();
  });
});
