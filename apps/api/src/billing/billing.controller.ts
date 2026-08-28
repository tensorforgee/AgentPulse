import {
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard';
import {
  ORGANIZATION_MANAGEMENT_ROLES,
  RequireOrganizationRoles,
} from '../organizations/organization-role.utils';
import type { OrganizationAuthorizedRequest } from '../organizations/organization.types';
import { BillingService } from './billing.service';

@Controller('organizations/:organizationId/billing')
@UseGuards(AccessTokenGuard, OrganizationMembershipGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  summary(@Req() request: OrganizationAuthorizedRequest) {
    const organizationId = request.organizationAccess?.organization.id;
    if (!organizationId) {
      throw new NotFoundException('Organization not found');
    }
    return this.billingService.summary(organizationId);
  }

  @Post('checkout')
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  checkout(@Req() request: OrganizationAuthorizedRequest) {
    const organizationId = request.organizationAccess?.organization.id;
    if (!organizationId) {
      throw new NotFoundException('Organization not found');
    }
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }
    return this.billingService.createCheckoutSession(
      organizationId,
      request.authUserId,
    );
  }

  @Post('portal')
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  portal(@Req() request: OrganizationAuthorizedRequest) {
    const organizationId = request.organizationAccess?.organization.id;
    if (!organizationId) {
      throw new NotFoundException('Organization not found');
    }
    return this.billingService.createPortalSession(organizationId);
  }
}
