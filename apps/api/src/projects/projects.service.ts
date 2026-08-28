import { ConflictException, Injectable } from '@nestjs/common';
import { entitlementsForPlan } from '../billing/billing.types';
import {
  assertPlanCapacity,
  lockOrganizationForPlanCheck,
} from '../billing/plan-enforcement';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import { projectSelect } from './project.types';
import { normalizeProjectSlug } from './project.utils';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateProjectDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { plan: true },
        });
        const limit = entitlementsForPlan(organization.plan).projectLimit;
        if (limit !== null) {
          await lockOrganizationForPlanCheck(tx, organizationId);
          const projectCount = await tx.project.count({
            where: { organizationId },
          });
          assertPlanCapacity('projects', projectCount, limit);
        }

        return tx.project.create({
          data: {
            organizationId,
            name: dto.name.trim(),
            slug: normalizeProjectSlug(dto.slug),
            description: dto.description?.trim() || null,
          },
          select: projectSelect,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A project with this slug already exists in the organization',
        );
      }

      throw error;
    }
  }

  listForOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      select: projectSelect,
      orderBy: { createdAt: 'desc' },
    });
  }
}
