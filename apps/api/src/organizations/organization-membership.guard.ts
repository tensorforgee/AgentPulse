import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORGANIZATION_ROLES,
  type OrganizationAuthorizedRequest,
  type OrganizationRole,
} from './organization.types';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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

    if (!membership || !this.isOrganizationRole(membership.role)) {
      throw new NotFoundException('Organization not found');
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

  private isOrganizationRole(role: string): role is OrganizationRole {
    return (ORGANIZATION_ROLES as readonly string[]).includes(role);
  }
}
