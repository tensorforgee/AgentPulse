import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AcceptOrganizationInviteDto } from './dto/accept-organization-invite.dto';
import { CreateOrganizationInviteDto } from './dto/create-organization-invite.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-member.dto';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { OrganizationMembersService } from './organization-members.service';
import {
  ORGANIZATION_MANAGEMENT_ROLES,
  RequireOrganizationRoles,
} from './organization-role.utils';
import type { OrganizationAuthorizedRequest } from './organization.types';

@Controller('organizations/:organizationId')
@UseGuards(AccessTokenGuard, OrganizationMembershipGuard)
export class OrganizationMembersController {
  constructor(private readonly members: OrganizationMembersService) {}

  @Get('members')
  listMembers(@Req() request: OrganizationAuthorizedRequest) {
    return this.members.listMembers(organizationId(request));
  }

  @Patch('members/:membershipId')
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  updateMember(
    @Req() request: OrganizationAuthorizedRequest,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateOrganizationMemberDto,
  ) {
    return this.members.updateMemberRole(
      organizationId(request),
      membershipId,
      request.organizationAccess!.role,
      dto.role,
    );
  }

  @Delete('members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  removeMember(
    @Req() request: OrganizationAuthorizedRequest,
    @Param('membershipId') membershipId: string,
  ) {
    return this.members.removeMember(
      organizationId(request),
      membershipId,
      request.organizationAccess!.role,
    );
  }

  @Get('invites')
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  listInvites(@Req() request: OrganizationAuthorizedRequest) {
    return this.members.listPendingInvites(organizationId(request));
  }

  @Post('invites')
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  createInvite(
    @Req() request: OrganizationAuthorizedRequest,
    @Body() dto: CreateOrganizationInviteDto,
  ) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }
    return this.members.createInvite(
      organizationId(request),
      request.authUserId,
      request.organizationAccess!.role,
      dto,
    );
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  revokeInvite(
    @Req() request: OrganizationAuthorizedRequest,
    @Param('inviteId') inviteId: string,
  ) {
    return this.members.revokeInvite(organizationId(request), inviteId);
  }
}

@Controller('organization-invites')
@UseGuards(AccessTokenGuard)
export class OrganizationInviteAcceptanceController {
  constructor(private readonly members: OrganizationMembersService) {}

  @Post('accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Body() dto: AcceptOrganizationInviteDto,
  ) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }
    return this.members.acceptInvite(request.authUserId, dto.token);
  }
}

function organizationId(request: OrganizationAuthorizedRequest): string {
  const id = request.organizationAccess?.organization.id;
  if (!id) {
    throw new NotFoundException('Organization not found');
  }
  return id;
}
