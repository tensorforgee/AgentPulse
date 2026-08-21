import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface TraceAggregateRow {
  totalCount: string;
  successCount: string;
  failedCount: string;
  averageLatencyMs: string | null;
  totalTokens: string;
  totalCost: string;
}

export interface TraceAggregateSummary {
  totalCount: bigint;
  successCount: bigint;
  failedCount: bigint;
  averageLatencyMs: Prisma.Decimal | null;
  totalTokens: bigint;
  totalCost: Prisma.Decimal;
}

interface TraceAggregateScope {
  projectId: string;
  startedAtFrom?: Date;
  startedAtTo?: Date;
  completedOnly?: boolean;
}

@Injectable()
export class TraceAggregatesService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(scope: TraceAggregateScope): Promise<TraceAggregateSummary> {
    const filters = [Prisma.sql`t."project_id" = ${scope.projectId}::uuid`];
    if (scope.startedAtFrom) {
      filters.push(Prisma.sql`t."started_at" >= ${scope.startedAtFrom}`);
    }
    if (scope.startedAtTo) {
      filters.push(Prisma.sql`t."started_at" <= ${scope.startedAtTo}`);
    }
    if (scope.completedOnly) {
      filters.push(Prisma.sql`t."status" IN ('success', 'failed')`);
    }

    const [row] = await this.prisma.$queryRaw<TraceAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::text AS "totalCount",
        COUNT(*) FILTER (WHERE t."status" = 'success')::text AS "successCount",
        COUNT(*) FILTER (WHERE t."status" = 'failed')::text AS "failedCount",
        AVG(t."duration_ms")::text AS "averageLatencyMs",
        COALESCE(SUM(t."total_tokens"), 0)::text AS "totalTokens",
        COALESCE(SUM(t."total_cost"), 0)::text AS "totalCost"
      FROM "traces" t
      WHERE ${Prisma.join(filters, ' AND ')}
    `);

    return {
      totalCount: BigInt(row.totalCount),
      successCount: BigInt(row.successCount),
      failedCount: BigInt(row.failedCount),
      averageLatencyMs:
        row.averageLatencyMs === null
          ? null
          : new Prisma.Decimal(row.averageLatencyMs),
      totalTokens: BigInt(row.totalTokens),
      totalCost: new Prisma.Decimal(row.totalCost),
    };
  }
}
