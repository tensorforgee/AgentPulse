import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeGateway {
  createCheckoutSession(
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
  ) {
    return this.client(secretKey).checkout.sessions.create(params);
  }

  createPortalSession(
    secretKey: string,
    params: Stripe.BillingPortal.SessionCreateParams,
  ) {
    return this.client(secretKey).billingPortal.sessions.create(params);
  }

  constructWebhookEvent(
    secretKey: string,
    payload: Buffer,
    signature: string,
    webhookSecret: string,
  ): Stripe.Event {
    return this.client(secretKey).webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  private client(secretKey: string): Stripe {
    return new Stripe(secretKey, {
      appInfo: { name: 'AgentPulse', version: '1.0.0' },
    });
  }
}
