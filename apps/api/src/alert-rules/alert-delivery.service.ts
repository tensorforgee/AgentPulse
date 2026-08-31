import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  alertEventSelect,
  type AlertEventRecord,
  serializeAlertEvent,
} from './alert-event.types';
import { AlertWebhookService } from './alert-webhook.service';

@Injectable()
export class AlertDeliveryService {
  private readonly logger = new Logger(AlertDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: AlertWebhookService,
  ) {}

  async deliver(event: AlertEventRecord): Promise<AlertEventRecord> {
    const result = await this.webhooks.deliver(
      event.projectId,
      this.payload(event),
    );
    if (result.status === 'failed') {
      this.logger.warn(`Alert webhook delivery failed for event ${event.id}`);
    }
    return this.updateStatus(
      event,
      result.status,
      result.attemptedAt,
      result.error,
    );
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
}
