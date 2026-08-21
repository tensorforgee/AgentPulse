export const ALERT_RULE_TYPES = ['error_rate', 'latency', 'cost'] as const;

export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];
