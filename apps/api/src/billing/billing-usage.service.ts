import { Injectable } from '@nestjs/common';
import type { BillingPlan } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { entitlementsForPlan } from './billing.types';

interface BillingPeriodSource {
  billingPeriodStartedAt: Date | null;
  billingPeriodEndsAt: Date | null;
}

@Injectable()
export class BillingUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganization(organizationId: string, now = new Date()) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        plan: true,
        subscriptionStatus: true,
        billingPeriodStartedAt: true,
        billingPeriodEndsAt: true,
        cancelAtPeriodEnd: true,
      },
    });
    const period = billingPeriod(organization, now);
    const [projects, members, traces] = await Promise.all([
      this.prisma.project.count({ where: { organizationId } }),
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.trace.count({
        where: {
          project: { organizationId },
          createdAt: { gte: period.startedAt, lt: period.endsAt },
        },
      }),
    ]);

    return {
      organizationId,
      plan: organization.plan,
      subscriptionStatus: organization.subscriptionStatus,
      cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
      period,
      usage: { projects, members, traces },
      entitlements: entitlementsForPlan(organization.plan),
    };
  }
}

export function billingPeriod(
  organization: BillingPeriodSource,
  now: Date,
): { startedAt: Date; endsAt: Date } {
  if (
    organization.billingPeriodStartedAt &&
    organization.billingPeriodEndsAt &&
    organization.billingPeriodStartedAt <= now &&
    organization.billingPeriodEndsAt > now
  ) {
    return {
      startedAt: organization.billingPeriodStartedAt,
      endsAt: organization.billingPeriodEndsAt,
    };
  }

  return {
    startedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export interface OrganizationPlanState {
  plan: BillingPlan;
  billingPeriodStartedAt: Date | null;
  billingPeriodEndsAt: Date | null;
}
