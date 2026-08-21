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
import { PrismaService } from '../prisma/prisma.service';
import { type OrganizationAuthorizedRequest } from './organization.types';
import {
  assertOrganizationRole,
  isOrganizationRole,
  REQUIRED_ORGANIZATION_ROLES,
} from './organization-role.utils';
import type { OrganizationRole } from './organization.types';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<OrganizationAuthorizedRequest>();
    const userId = request.authUserId;
    const organizationId = request.params.organizationId;

    if (!userId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    if (typeof organizationId !== 'string' || !isUUID(organizationId)) {
      throw new BadRequestException('organizationId must be a UUID');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      include: { organization: true },
    });

    if (!membership || !isOrganizationRole(membership.role)) {
      throw new NotFoundException('Organization not found');
    }

    const requiredRoles = this.reflector.getAllAndOverride<
      readonly OrganizationRole[]
    >(REQUIRED_ORGANIZATION_ROLES, [context.getHandler(), context.getClass()]);
    if (requiredRoles) {
      assertOrganizationRole(membership.role, requiredRoles);
    }

    request.organizationAccess = {
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        createdAt: membership.organization.createdAt,
        updatedAt: membership.organization.updatedAt,
      },
      role: membership.role,
    };
    return true;
  }
}
