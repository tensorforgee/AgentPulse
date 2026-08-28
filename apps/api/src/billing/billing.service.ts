import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { isUUID } from 'class-validator';
import {
  BillingPlan,
  Prisma,
  SubscriptionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  checkoutConfigurationError,
  stripeBillingConfiguration,
  webhookConfigurationError,
} from './stripe-billing.config';
import { StripeGateway } from './stripe.gateway';
import { BillingUsageService } from './billing-usage.service';

const STRIPE_PROVIDER = 'stripe';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly usage: BillingUsageService,
  ) {}

  configurationState() {
    const config = stripeBillingConfiguration();
    return {
      checkoutAvailable: checkoutConfigurationError(config) === null,
      webhookConfigured: webhookConfigurationError(config) === null,
    };
  }

  async summary(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        billingProvider: true,
        externalBillingCustomerId: true,
      },
    });
    const configuration = this.configurationState();
    return {
      ...(await this.usage.forOrganization(organizationId)),
      stripe: {
        ...configuration,
        portalAvailable:
          configuration.checkoutAvailable &&
          organization.billingProvider === STRIPE_PROVIDER &&
          Boolean(organization.externalBillingCustomerId),
      },
    };
  }

  async createCheckoutSession(organizationId: string, userId: string) {
    const config = stripeBillingConfiguration();
    const configError = checkoutConfigurationError(config);
    if (configError) {
      throw new ServiceUnavailableException(configError);
    }

    const [organization, user] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          plan: true,
          subscriptionStatus: true,
          billingProvider: true,
          externalBillingCustomerId: true,
          externalBillingSubscriptionId: true,
        },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      }),
    ]);

    if (
      organization.externalBillingSubscriptionId ||
      organization.subscriptionStatus === SubscriptionStatus.active ||
      organization.subscriptionStatus === SubscriptionStatus.trialing ||
      organization.subscriptionStatus === SubscriptionStatus.past_due
    ) {
      throw new ConflictException(
        'This organization already has a subscription; use billing management',
      );
    }

    if (
      organization.billingProvider &&
      organization.billingProvider !== STRIPE_PROVIDER
    ) {
      throw new ConflictException(
        'This organization is linked to another billing provider',
      );
    }

    try {
      const session = await this.stripe.createCheckoutSession(
        config.secretKey!,
        {
          mode: 'subscription',
          line_items: [{ price: config.proPriceId!, quantity: 1 }],
          success_url: `${config.webBaseUrl!}/app/billing?checkout=success`,
          cancel_url: `${config.webBaseUrl!}/app/billing?checkout=canceled`,
          client_reference_id: organizationId,
          metadata: { organizationId },
          subscription_data: { metadata: { organizationId } },
          ...(organization.externalBillingCustomerId
            ? { customer: organization.externalBillingCustomerId }
            : { customer_email: user.email }),
        },
      );

      if (!session.url) {
        throw new BadGatewayException('Stripe did not return a Checkout URL');
      }
      return { url: session.url };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('Could not create Stripe Checkout session');
    }
  }

  async createPortalSession(organizationId: string) {
    const config = stripeBillingConfiguration();
    const configError = checkoutConfigurationError(config);
    if (configError) {
      throw new ServiceUnavailableException(configError);
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        billingProvider: true,
        externalBillingCustomerId: true,
      },
    });

    if (
      organization.billingProvider !== STRIPE_PROVIDER ||
      !organization.externalBillingCustomerId
    ) {
      throw new ConflictException(
        'This organization does not have a Stripe customer to manage',
      );
    }

    try {
      const session = await this.stripe.createPortalSession(config.secretKey!, {
        customer: organization.externalBillingCustomerId,
        return_url: `${config.webBaseUrl!}/app/billing`,
      });
      return { url: session.url };
    } catch {
      throw new BadGatewayException('Could not create Stripe billing portal');
    }
  }

  constructStripeEvent(
    payload: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    const config = stripeBillingConfiguration();
    const configError = webhookConfigurationError(config);
    if (configError) {
      throw new ServiceUnavailableException(configError);
    }
    if (!payload || !signature) {
      throw new BadRequestException(
        'A valid Stripe webhook signature is required',
      );
    }

    try {
      return this.stripe.constructWebhookEvent(
        config.secretKey!,
        payload,
        signature,
        config.webhookSecret!,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
  }

  async processStripeEvent(event: Stripe.Event) {
    try {
      const organizationId = await this.prisma.$transaction(async (tx) => {
        await tx.billingWebhookEvent.create({
          data: {
            provider: STRIPE_PROVIDER,
            externalEventId: event.id,
            eventType: event.type,
          },
        });

        const resolvedOrganizationId = await this.applyStripeEvent(tx, event);
        if (resolvedOrganizationId) {
          await tx.billingWebhookEvent.update({
            where: {
              provider_externalEventId: {
                provider: STRIPE_PROVIDER,
                externalEventId: event.id,
              },
            },
            data: { organizationId: resolvedOrganizationId },
          });
        }
        return resolvedOrganizationId;
      });

      return { received: true, duplicate: false, organizationId };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const receipt = await this.prisma.billingWebhookEvent.findUnique({
          where: {
            provider_externalEventId: {
              provider: STRIPE_PROVIDER,
              externalEventId: event.id,
            },
          },
          select: { organizationId: true },
        });
        if (receipt) {
          return {
            received: true,
            duplicate: true,
            organizationId: receipt.organizationId,
          };
        }
      }
      throw error;
    }
  }

  private async applyStripeEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<string | null> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.applyCheckoutCompleted(tx, event.data.object);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.applySubscription(tx, event.data.object);
      default:
        return null;
    }
  }

  private async applyCheckoutCompleted(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<string | null> {
    const organizationId =
      session.metadata?.organizationId ?? session.client_reference_id;
    if (!organizationId || !isUUID(organizationId)) {
      return null;
    }

    const customerId = stripeId(session.customer);
    const subscriptionId = stripeId(session.subscription);
    await this.assertStripeAssociation(
      tx,
      organizationId,
      customerId,
      subscriptionId,
    );
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        billingProvider: STRIPE_PROVIDER,
        ...(customerId ? { externalBillingCustomerId: customerId } : {}),
        ...(subscriptionId
          ? { externalBillingSubscriptionId: subscriptionId }
          : {}),
      },
    });
    return organizationId;
  }

  private async applySubscription(
    tx: Prisma.TransactionClient,
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const customerId = stripeId(subscription.customer);
    const metadataOrganizationId = subscription.metadata.organizationId;
    const candidates = await tx.organization.findMany({
      where: {
        OR: [
          { externalBillingSubscriptionId: subscription.id },
          ...(customerId
            ? [
                {
                  billingProvider: STRIPE_PROVIDER,
                  externalBillingCustomerId: customerId,
                },
              ]
            : []),
          ...(metadataOrganizationId && isUUID(metadataOrganizationId)
            ? [{ id: metadataOrganizationId }]
            : []),
        ],
      },
      select: { id: true },
    });
    const candidateIds = [...new Set(candidates.map(({ id }) => id))];
    if (candidateIds.length === 0) {
      return null;
    }
    if (candidateIds.length > 1) {
      throw new ConflictException('Stripe subscription organization mismatch');
    }

    const organizationId = candidateIds[0];
    const config = stripeBillingConfiguration();
    const isProSubscription = subscription.items.data.some(
      (item) => item.price.id === config.proPriceId,
    );
    const status = isProSubscription
      ? internalSubscriptionStatus(subscription.status)
      : SubscriptionStatus.none;
    const plan =
      isProSubscription &&
      (status === SubscriptionStatus.active ||
        status === SubscriptionStatus.trialing ||
        status === SubscriptionStatus.past_due)
        ? BillingPlan.pro
        : BillingPlan.free;
    const period = subscriptionPeriod(subscription);

    await this.assertStripeAssociation(
      tx,
      organizationId,
      customerId,
      subscription.id,
    );
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        plan,
        subscriptionStatus: status,
        billingProvider: STRIPE_PROVIDER,
        externalBillingSubscriptionId: subscription.id,
        ...(customerId ? { externalBillingCustomerId: customerId } : {}),
        billingPeriodStartedAt: period?.startedAt ?? null,
        billingPeriodEndsAt: period?.endsAt ?? null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
    return organizationId;
  }

  private async assertStripeAssociation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string | null,
    subscriptionId: string | null,
  ): Promise<void> {
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        billingProvider: true,
        externalBillingCustomerId: true,
        externalBillingSubscriptionId: true,
      },
    });

    if (
      (organization.billingProvider &&
        organization.billingProvider !== STRIPE_PROVIDER) ||
      (customerId &&
        organization.externalBillingCustomerId &&
        organization.externalBillingCustomerId !== customerId) ||
      (subscriptionId &&
        organization.externalBillingSubscriptionId &&
        organization.externalBillingSubscriptionId !== subscriptionId)
    ) {
      throw new ConflictException('Stripe billing organization mismatch');
    }
  }
}

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

function internalSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.active;
    case 'trialing':
      return SubscriptionStatus.trialing;
    case 'past_due':
    case 'paused':
    case 'unpaid':
      return SubscriptionStatus.past_due;
    case 'canceled':
    case 'incomplete_expired':
      return SubscriptionStatus.canceled;
    case 'incomplete':
      return SubscriptionStatus.none;
  }
}

function subscriptionPeriod(
  subscription: Stripe.Subscription,
): { startedAt: Date; endsAt: Date } | undefined {
  const item = subscription.items.data[0];
  if (!item || item.current_period_end <= item.current_period_start) {
    return undefined;
  }
  return {
    startedAt: new Date(item.current_period_start * 1000),
    endsAt: new Date(item.current_period_end * 1000),
  };
}
