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

const FREE_ENTITLEMENTS = Object.freeze({
  projectLimit: 1,
  organizationMemberLimit: 3,
  monthlyTraceLimit: 10_000,
  traceRetentionDays: null,
}) satisfies PlanEntitlements;

const PRO_ENTITLEMENTS = Object.freeze({
  projectLimit: null,
  organizationMemberLimit: null,
  monthlyTraceLimit: null,
  traceRetentionDays: null,
}) satisfies PlanEntitlements;

/**
 * The single source of truth for plan entitlements. A null limit always means
 * unlimited and must bypass enforcement.
 */
export const PLAN_ENTITLEMENTS = Object.freeze({
  [BillingPlan.free]: FREE_ENTITLEMENTS,
  [BillingPlan.pro]: PRO_ENTITLEMENTS,
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
