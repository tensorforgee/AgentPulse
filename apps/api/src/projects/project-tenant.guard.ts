import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Reflector } from '@nestjs/core';
import {
  assertOrganizationRole,
  isOrganizationRole,
  REQUIRED_ORGANIZATION_ROLES,
} from '../organizations/organization-role.utils';
import type { OrganizationRole } from '../organizations/organization.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  projectSelect,
  type ProjectAuthorizedRequest,
  type ProjectSummary,
} from './project.types';

@Injectable()
export class ProjectTenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ProjectAuthorizedRequest>();
    const userId = request.authUserId;
    const projectId = request.params.projectId;

    if (!userId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    if (typeof projectId !== 'string' || !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization: { memberships: { some: { userId } } },
      },
      select: {
        ...projectSelect,
        organization: {
          select: {
            memberships: {
              where: { userId },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });

    const role = project?.organization.memberships[0]?.role;
    if (!project || !role || !isOrganizationRole(role)) {
      throw new NotFoundException('Project not found');
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      readonly OrganizationRole[]
    >(REQUIRED_ORGANIZATION_ROLES, [context.getHandler(), context.getClass()]);
    if (requiredRoles) {
      assertOrganizationRole(role, requiredRoles);
    }

    const projectSummary: ProjectSummary = {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    request.projectAccess = { project: projectSummary, role };
    return true;
  }
}
