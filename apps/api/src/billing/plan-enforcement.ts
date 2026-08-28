import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export type LimitedResource = 'projects' | 'members' | 'monthly_traces';

export class PlanLimitExceededException extends HttpException {
  constructor(resource: LimitedResource, limit: number) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Plan limit exceeded',
        code: 'PLAN_LIMIT_EXCEEDED',
        message: `The organization has reached its ${resource.replace('_', ' ')} limit`,
        resource,
        limit,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export function assertPlanCapacity(
  resource: LimitedResource,
  currentUsage: number,
  limit: number | null,
): void {
  if (limit !== null && currentUsage >= limit) {
    throw new PlanLimitExceededException(resource, limit);
  }
}

export async function lockOrganizationForPlanCheck(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ locked: string }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))::text AS locked
  `;
}
