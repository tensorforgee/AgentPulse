import { BillingPlan, SubscriptionStatus } from '../generated/prisma/enums';
import { BillingUsageService, billingPeriod } from './billing-usage.service';

describe('BillingUsageService', () => {
  it('uses an active provider period and otherwise falls back to a UTC month', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    expect(
      billingPeriod(
        {
          billingPeriodStartedAt: new Date('2026-08-15T00:00:00.000Z'),
          billingPeriodEndsAt: new Date('2026-09-15T00:00:00.000Z'),
        },
        now,
      ),
    ).toEqual({
      startedAt: new Date('2026-08-15T00:00:00.000Z'),
      endsAt: new Date('2026-09-15T00:00:00.000Z'),
    });
    expect(
      billingPeriod(
        { billingPeriodStartedAt: null, billingPeriodEndsAt: null },
        now,
      ),
    ).toEqual({
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('counts only persisted usage owned by the requested organization', async () => {
    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          plan: BillingPlan.free,
          subscriptionStatus: SubscriptionStatus.none,
          billingPeriodStartedAt: null,
          billingPeriodEndsAt: null,
          cancelAtPeriodEnd: false,
        }),
      },
      project: { count: jest.fn().mockResolvedValue(1) },
      organizationMember: { count: jest.fn().mockResolvedValue(2) },
      trace: { count: jest.fn().mockResolvedValue(42) },
    };
    const service = new BillingUsageService(prisma as never);
    const result = await service.forOrganization(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-08-27T12:00:00.000Z'),
    );

    expect(result.usage).toEqual({ projects: 1, members: 2, traces: 42 });
    expect(prisma.trace.count).toHaveBeenCalledWith({
      where: {
        project: {
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
        createdAt: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lt: new Date('2026-09-01T00:00:00.000Z'),
        },
      },
    });
  });
});
