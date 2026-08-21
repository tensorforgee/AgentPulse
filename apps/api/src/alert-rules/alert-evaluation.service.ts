import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { TraceAggregatesService } from '../traces/trace-aggregates.service';
import {
  alertEventSelect,
  type AlertEventRecord,
  serializeAlertEvent,
} from './alert-event.types';
import type { AlertRuleType } from './alert-rule.types';
import { AlertDeliveryService } from './alert-delivery.service';

const EVALUATION_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: AlertDeliveryService,
    private readonly realtime: RealtimeEventsService,
    private readonly traceAggregates: TraceAggregatesService,
  ) {}

  async evaluate(projectId: string, traceId: string): Promise<void> {
    const trace = await this.prisma.trace.findFirst({
      where: { id: traceId, projectId },
      select: { id: true, status: true, startedAt: true },
    });
    if (!trace || !['success', 'failed'].includes(trace.status)) {
      return;
    }

    const rules = await this.prisma.alertRule.findMany({
      where: { projectId, enabled: true },
      select: { id: true, name: true, type: true, threshold: true },
    });
    if (rules.length === 0) {
      return;
    }

    const windowEndedAt = trace.startedAt;
    const windowStartedAt = new Date(
      windowEndedAt.getTime() - EVALUATION_WINDOW_MS,
    );
    const summary = await this.traceAggregates.summarize({
      projectId,
      completedOnly: true,
      startedAtFrom: windowStartedAt,
      startedAtTo: windowEndedAt,
    });
    const values = evaluationValues(summary);
    const events: AlertEventRecord[] = [];

    for (const rule of rules) {
      const observedValue = values[rule.type as AlertRuleType];
      if (!observedValue || observedValue.lessThan(rule.threshold)) {
        continue;
      }

      const event = await this.createEvent({
        projectId,
        alertRuleId: rule.id,
        traceId,
        ruleName: rule.name,
        ruleType: rule.type,
        threshold: rule.threshold,
        observedValue,
        windowStartedAt,
        windowEndedAt,
      });
      if (!event) {
        continue;
      }
      events.push(event);
    }

    await Promise.all(
      events.map(async (event) => {
        const delivered = await this.delivery.deliver(event);
        this.realtime.publish(projectId, 'alert.triggered', {
          alertEvent: serializeAlertEvent(delivered),
        });
      }),
    );
  }

  private async createEvent(
    data: Prisma.AlertEventUncheckedCreateInput,
  ): Promise<AlertEventRecord | null> {
    try {
      return await this.prisma.alertEvent.create({
        data,
        select: alertEventSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }

      this.logger.error('Alert event persistence failed');
      throw error;
    }
  }
}

function evaluationValues(
  summary: Awaited<ReturnType<TraceAggregatesService['summarize']>>,
): Record<AlertRuleType, Prisma.Decimal | null> {
  return {
    error_rate: summary.totalCount
      ? new Prisma.Decimal(summary.failedCount.toString()).div(
          summary.totalCount.toString(),
        )
      : null,
    latency: summary.averageLatencyMs,
    cost: summary.totalCost,
  };
}
