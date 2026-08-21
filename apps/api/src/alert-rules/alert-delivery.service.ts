import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isAllowedOutboundUrl } from '../operations/security-config';
import {
  alertEventSelect,
  type AlertEventRecord,
  serializeAlertEvent,
} from './alert-event.types';

@Injectable()
export class AlertDeliveryService {
  private readonly logger = new Logger(AlertDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deliver(event: AlertEventRecord): Promise<AlertEventRecord> {
    const webhookUrl = this.webhookUrl(event.projectId);
    if (!webhookUrl) {
      return this.updateStatus(event, 'not_configured', null, null);
    }

    const attemptedAt = new Date();
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.payload(event)),
        signal: AbortSignal.timeout(3_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return this.updateStatus(event, 'delivered', attemptedAt, null);
    } catch (error) {
      this.logger.warn(`Alert webhook delivery failed for event ${event.id}`);
      const deliveryError =
        error instanceof Error && /^HTTP \d{3}$/.test(error.message)
          ? error.message
          : 'Request failed';
      return this.updateStatus(event, 'failed', attemptedAt, deliveryError);
    }
  }

  private async updateStatus(
    event: AlertEventRecord,
    deliveryStatus: string,
    deliveryAttemptedAt: Date | null,
    deliveryError: string | null,
  ): Promise<AlertEventRecord> {
    try {
      return await this.prisma.alertEvent.update({
        where: { id: event.id },
        data: { deliveryStatus, deliveryAttemptedAt, deliveryError },
        select: alertEventSelect,
      });
    } catch {
      this.logger.error(
        `Could not persist delivery status for alert event ${event.id}`,
      );
      return event;
    }
  }

  private payload(event: AlertEventRecord) {
    const serialized = serializeAlertEvent(event);
    return {
      text: `[AgentPulse] ${event.ruleName} triggered: ${event.ruleType} observed ${event.observedValue.toString()} (threshold ${event.threshold.toString()})`,
      agentpulse: serialized,
    };
  }

  private webhookUrl(projectId: string): string | null {
    const configured = process.env.ALERT_WEBHOOK_URLS_JSON;
    if (!configured) {
      return null;
    }

    try {
      const mapping = JSON.parse(configured) as unknown;
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        return null;
      }

      const value = (mapping as Record<string, unknown>)[projectId];
      if (typeof value !== 'string') {
        return null;
      }

      const url = new URL(value);
      return isAllowedOutboundUrl(url) ? url.toString() : null;
    } catch {
      this.logger.warn('Alert webhook configuration is invalid');
      return null;
    }
  }
}
