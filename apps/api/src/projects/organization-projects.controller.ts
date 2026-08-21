import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard';
import type { OrganizationAuthorizedRequest } from '../organizations/organization.types';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

function authorizedOrganizationId(
  request: OrganizationAuthorizedRequest,
): string {
  if (!request.organizationAccess) {
    throw new NotFoundException('Organization not found');
  }

  return request.organizationAccess.organization.id;
}

@Controller('organizations/:organizationId/projects')
@UseGuards(AccessTokenGuard, OrganizationMembershipGuard)
export class OrganizationProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @Req() request: OrganizationAuthorizedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(authorizedOrganizationId(request), dto);
  }

  @Get()
  list(@Req() request: OrganizationAuthorizedRequest) {
    return this.projectsService.listForOrganization(
      authorizedOrganizationId(request),
    );
  }
}
