import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AlertRuleType } from './alert-rule.types';
import type { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import type { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

const alertRuleSelect = {
  id: true,
  projectId: true,
  name: true,
  type: true,
  threshold: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AlertRuleSelect;

type AlertRuleRecord = Prisma.AlertRuleGetPayload<{
  select: typeof alertRuleSelect;
}>;

@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateAlertRuleDto) {
    validateThreshold(dto.type, dto.threshold);

    const record = await this.prisma.alertRule.create({
      data: { projectId, ...dto },
      select: alertRuleSelect,
    });

    return serializeAlertRule(record);
  }

  async list(projectId: string) {
    const records = await this.prisma.alertRule.findMany({
      where: { projectId },
      select: alertRuleSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return records.map(serializeAlertRule);
  }

  async getForMember(alertRuleId: string, userId: string) {
    return serializeAlertRule(
      await this.findRecordForMember(alertRuleId, userId),
    );
  }

  async updateForMember(
    alertRuleId: string,
    userId: string,
    dto: UpdateAlertRuleDto,
  ) {
    if (
      dto.name === undefined &&
      dto.type === undefined &&
      dto.threshold === undefined &&
      dto.enabled === undefined
    ) {
      throw new BadRequestException('At least one field must be provided');
    }

    const current = await this.findRecordForMember(alertRuleId, userId);
    const type = (dto.type ?? current.type) as AlertRuleType;
    const threshold = dto.threshold ?? current.threshold.toNumber();
    validateThreshold(type, threshold);

    const record = await this.prisma.alertRule.update({
      where: { id: current.id },
      data: dto,
      select: alertRuleSelect,
    });

    return serializeAlertRule(record);
  }

  async deleteForMember(alertRuleId: string, userId: string): Promise<void> {
    const current = await this.findRecordForMember(alertRuleId, userId);
    await this.prisma.alertRule.delete({ where: { id: current.id } });
  }

  private async findRecordForMember(alertRuleId: string, userId: string) {
    const record = await this.prisma.alertRule.findFirst({
      where: {
        id: alertRuleId,
        project: {
          organization: { memberships: { some: { userId } } },
        },
      },
      select: alertRuleSelect,
    });

    if (!record) {
      throw new NotFoundException('Alert rule not found');
    }

    return record;
  }
}

function validateThreshold(type: AlertRuleType, threshold: number): void {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new BadRequestException('threshold must be greater than zero');
  }

  if (type === 'error_rate' && threshold > 1) {
    throw new BadRequestException(
      'error_rate threshold must be a ratio greater than zero and at most 1',
    );
  }

  if (type === 'latency' && !Number.isInteger(threshold)) {
    throw new BadRequestException(
      'latency threshold must be a whole number of milliseconds',
    );
  }
}

function serializeAlertRule(record: AlertRuleRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    type: record.type,
    threshold: record.threshold.toString(),
    enabled: record.enabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
