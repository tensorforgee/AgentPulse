import { BillingPlan, SubscriptionStatus } from '../generated/prisma/enums';

export const BILLING_PLAN_IDS = [BillingPlan.free, BillingPlan.pro] as const;

export const SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.none,
  SubscriptionStatus.trialing,
  SubscriptionStatus.active,
  SubscriptionStatus.past_due,
  SubscriptionStatus.canceled,
] as const;

export interface PlanEntitlements {
  readonly projectLimit: number | null;
  readonly organizationMemberLimit: number | null;
  readonly monthlyTraceLimit: number | null;
  readonly traceRetentionDays: number | null;
}

const CURRENT_UNENFORCED_ENTITLEMENTS = Object.freeze({
  projectLimit: null,
  organizationMemberLimit: null,
  monthlyTraceLimit: null,
  traceRetentionDays: null,
}) satisfies PlanEntitlements;

/**
 * The single source of truth for plan entitlements. A null limit means the
 * capability remains unenforced, preserving existing behavior until product
 * limits are explicitly defined and enforcement is added.
 */
export const PLAN_ENTITLEMENTS = Object.freeze({
  [BillingPlan.free]: CURRENT_UNENFORCED_ENTITLEMENTS,
  [BillingPlan.pro]: CURRENT_UNENFORCED_ENTITLEMENTS,
}) satisfies Readonly<Record<BillingPlan, PlanEntitlements>>;

export function isBillingPlan(value: string): value is BillingPlan {
  return (BILLING_PLAN_IDS as readonly string[]).includes(value);
}

export function isSubscriptionStatus(
  value: string,
): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function entitlementsForPlan(
  plan: BillingPlan,
): Readonly<PlanEntitlements> {
  return PLAN_ENTITLEMENTS[plan];
}
