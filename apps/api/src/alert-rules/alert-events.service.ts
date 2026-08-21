import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { alertEventSelect, serializeAlertEvent } from './alert-event.types';

@Injectable()
export class AlertEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    const events = await this.prisma.alertEvent.findMany({
      where: { projectId },
      select: alertEventSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });

    return events.map(serializeAlertEvent);
  }

  async getForMember(alertEventId: string, userId: string) {
    const event = await this.prisma.alertEvent.findFirst({
      where: {
        id: alertEventId,
        project: {
          organization: { memberships: { some: { userId } } },
        },
      },
      select: alertEventSelect,
    });
    if (!event) {
      throw new NotFoundException('Alert event not found');
    }

    return serializeAlertEvent(event);
  }
}
