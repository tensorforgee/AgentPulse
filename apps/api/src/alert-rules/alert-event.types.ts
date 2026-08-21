import { Prisma } from '../generated/prisma/client';

export const alertEventSelect = {
  id: true,
  projectId: true,
  alertRuleId: true,
  traceId: true,
  ruleName: true,
  ruleType: true,
  threshold: true,
  observedValue: true,
  windowStartedAt: true,
  windowEndedAt: true,
  deliveryStatus: true,
  deliveryAttemptedAt: true,
  createdAt: true,
} satisfies Prisma.AlertEventSelect;

export type AlertEventRecord = Prisma.AlertEventGetPayload<{
  select: typeof alertEventSelect;
}>;

export function serializeAlertEvent(record: AlertEventRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    alertRuleId: record.alertRuleId,
    traceId: record.traceId,
    ruleName: record.ruleName,
    ruleType: record.ruleType,
    threshold: record.threshold.toString(),
    observedValue: record.observedValue.toString(),
    windowStartedAt: record.windowStartedAt.toISOString(),
    windowEndedAt: record.windowEndedAt.toISOString(),
    deliveryStatus: record.deliveryStatus,
    deliveryAttemptedAt: record.deliveryAttemptedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}
