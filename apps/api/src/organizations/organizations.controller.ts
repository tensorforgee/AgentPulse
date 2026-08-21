import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import type { OrganizationAuthorizedRequest } from './organization.types';
import { OrganizationsService } from './organizations.service';

function authenticatedUserId(request: AuthenticatedRequest): string {
  if (!request.authUserId) {
    throw new UnauthorizedException('A valid access token is required');
  }

  return request.authUserId;
}

@Controller('organizations')
@UseGuards(AccessTokenGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(authenticatedUserId(request), dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.organizationsService.listForUser(authenticatedUserId(request));
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMembershipGuard)
  get(@Req() request: OrganizationAuthorizedRequest) {
    if (!request.organizationAccess) {
      throw new UnauthorizedException('Organization access was not resolved');
    }

    return {
      ...request.organizationAccess.organization,
      role: request.organizationAccess.role,
    };
  }
}
