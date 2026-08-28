import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeEmail } from '../auth/auth.utils';
import { entitlementsForPlan } from '../billing/billing.types';
import {
  assertPlanCapacity,
  lockOrganizationForPlanCheck,
} from '../billing/plan-enforcement';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateOrganizationInviteDto,
  InvitableOrganizationRole,
} from './dto/create-organization-invite.dto';
import type { OrganizationRole } from './organization.types';
import {
  createOrganizationInviteToken,
  digestOrganizationInviteToken,
  ORGANIZATION_INVITE_TTL_MS,
} from './organization-invite.utils';

const memberSelect = {
  id: true,
  organizationId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.OrganizationMemberSelect;

const inviteSelect = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.OrganizationInviteSelect;

@Injectable()
export class OrganizationMembersService {
  constructor(private readonly prisma: PrismaService) {}

  listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  listPendingInvites(organizationId: string) {
    return this.prisma.organizationInvite.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: inviteSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvite(
    organizationId: string,
    actorUserId: string,
    actorRole: OrganizationRole,
    dto: CreateOrganizationInviteDto,
  ) {
    assertCanAssignRole(actorRole, dto.role);
    const email = normalizeEmail(dto.email);
    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email } },
      select: { id: true },
    });
    if (existingMember) {
      throw new ConflictException(
        'This user is already an organization member',
      );
    }

    const token = createOrganizationInviteToken();
    const expiresAt = new Date(Date.now() + ORGANIZATION_INVITE_TTL_MS);
    const invite = await this.prisma.organizationInvite.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: {
        organizationId,
        email,
        role: dto.role,
        tokenDigest: digestOrganizationInviteToken(token),
        expiresAt,
        createdByUserId: actorUserId,
      },
      update: {
        role: dto.role,
        tokenDigest: digestOrganizationInviteToken(token),
        expiresAt,
        acceptedAt: null,
        acceptedByUserId: null,
        revokedAt: null,
        createdByUserId: actorUserId,
        createdAt: new Date(),
      },
      select: inviteSelect,
    });

    return {
      invite,
      acceptPath: `/app/invitations?token=${encodeURIComponent(token)}`,
    };
  }

  async revokeInvite(organizationId: string, inviteId: string) {
    const result = await this.prisma.organizationInvite.updateMany({
      where: {
        id: inviteId,
        organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Invitation not found');
    }
  }

  async acceptInvite(userId: string, token: string) {
    const tokenDigest = digestOrganizationInviteToken(token);
    return this.prisma.$transaction(
      async (tx) => {
        const [invite, user] = await Promise.all([
          tx.organizationInvite.findUnique({
            where: { tokenDigest },
            include: { organization: true },
          }),
          tx.user.findUnique({
            where: { id: userId },
            select: { email: true },
          }),
        ]);

        if (
          !invite ||
          invite.acceptedAt ||
          invite.revokedAt ||
          invite.expiresAt <= new Date()
        ) {
          throw new NotFoundException('Invitation is invalid or expired');
        }
        if (!user || normalizeEmail(user.email) !== invite.email) {
          throw new ForbiddenException(
            'Invitation belongs to a different account',
          );
        }
        const existing = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invite.organizationId,
              userId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException(
            'User is already a member of this organization',
          );
        }

        const memberLimit = entitlementsForPlan(
          invite.organization.plan,
        ).organizationMemberLimit;
        if (memberLimit !== null) {
          await lockOrganizationForPlanCheck(tx, invite.organizationId);
          const memberCount = await tx.organizationMember.count({
            where: { organizationId: invite.organizationId },
          });
          assertPlanCapacity('members', memberCount, memberLimit);
        }

        const consumed = await tx.organizationInvite.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date(), acceptedByUserId: userId },
        });
        if (consumed.count !== 1) {
          throw new ConflictException('Invitation has already been used');
        }

        await tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId,
            role: invite.role,
          },
        });
        return {
          id: invite.organization.id,
          name: invite.organization.name,
          slug: invite.organization.slug,
          plan: invite.organization.plan,
          subscriptionStatus: invite.organization.subscriptionStatus,
          createdAt: invite.organization.createdAt,
          updatedAt: invite.organization.updatedAt,
          role: invite.role as OrganizationRole,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    actorRole: OrganizationRole,
    nextRole: OrganizationRole,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganizationForPlanCheck(tx, organizationId);
        const target = await tx.organizationMember.findFirst({
          where: { id: membershipId, organizationId },
          select: { id: true, role: true },
        });
        if (!target) {
          throw new NotFoundException('Organization member not found');
        }
        assertCanManageMember(
          actorRole,
          target.role as OrganizationRole,
          nextRole,
        );
        if (target.role === 'owner' && nextRole !== 'owner') {
          await this.assertNotLastOwner(tx, organizationId);
        }
        return tx.organizationMember.update({
          where: { id: membershipId },
          data: { role: nextRole },
          select: memberSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async removeMember(
    organizationId: string,
    membershipId: string,
    actorRole: OrganizationRole,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        await lockOrganizationForPlanCheck(tx, organizationId);
        const target = await tx.organizationMember.findFirst({
          where: { id: membershipId, organizationId },
          select: { id: true, role: true },
        });
        if (!target) {
          throw new NotFoundException('Organization member not found');
        }
        assertCanManageMember(actorRole, target.role as OrganizationRole);
        if (target.role === 'owner') {
          await this.assertNotLastOwner(tx, organizationId);
        }
        await tx.organizationMember.delete({
          where: { id: membershipId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertNotLastOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const ownerCount = await tx.organizationMember.count({
      where: { organizationId, role: 'owner' },
    });
    if (ownerCount <= 1) {
      throw new ConflictException(
        'The organization must retain at least one owner',
      );
    }
  }
}

function assertCanAssignRole(
  actorRole: OrganizationRole,
  targetRole: InvitableOrganizationRole,
) {
  if (actorRole === 'admin' && targetRole === 'admin') {
    throw new ForbiddenException('Admins cannot grant the admin role');
  }
}

function assertCanManageMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  nextRole?: OrganizationRole,
) {
  if (
    actorRole === 'admin' &&
    (targetRole === 'owner' ||
      targetRole === 'admin' ||
      nextRole === 'owner' ||
      nextRole === 'admin')
  ) {
    throw new ForbiddenException('Admins cannot manage owners or other admins');
  }
}
