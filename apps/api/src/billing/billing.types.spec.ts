import { BillingPlan, SubscriptionStatus } from '../generated/prisma/enums';
import {
  BILLING_PLAN_IDS,
  entitlementsForPlan,
  isBillingPlan,
  isSubscriptionStatus,
  PLAN_ENTITLEMENTS,
  SUBSCRIPTION_STATUSES,
} from './billing.types';

describe('billing types and entitlements', () => {
  it('accepts only supported plan identifiers', () => {
    expect(BILLING_PLAN_IDS).toEqual(['free', 'pro']);
    expect(isBillingPlan('free')).toBe(true);
    expect(isBillingPlan('pro')).toBe(true);
    expect(isBillingPlan('enterprise')).toBe(false);
  });

  it('accepts only supported subscription statuses', () => {
    expect(SUBSCRIPTION_STATUSES).toEqual([
      'none',
      'trialing',
      'active',
      'past_due',
      'canceled',
    ]);
    expect(isSubscriptionStatus('active')).toBe(true);
    expect(isSubscriptionStatus('past_due')).toBe(true);
    expect(isSubscriptionStatus('expired')).toBe(false);
  });

  it('defines entitlements centrally for every plan', () => {
    expect(Object.keys(PLAN_ENTITLEMENTS).sort()).toEqual(
      [...BILLING_PLAN_IDS].sort(),
    );
    expect(entitlementsForPlan(BillingPlan.free)).toEqual({
      projectLimit: null,
      organizationMemberLimit: null,
      monthlyTraceLimit: null,
      traceRetentionDays: null,
    });
    expect(entitlementsForPlan(BillingPlan.pro)).toBe(
      entitlementsForPlan(BillingPlan.free),
    );
    expect(SubscriptionStatus.none).toBe('none');
  });
});
