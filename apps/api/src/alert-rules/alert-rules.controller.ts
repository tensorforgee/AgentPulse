import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  ORGANIZATION_MANAGEMENT_ROLES,
  RequireOrganizationRoles,
} from '../organizations/organization-role.utils';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

function authorizedProjectId(request: ProjectAuthorizedRequest): string {
  if (!request.projectAccess) {
    throw new NotFoundException('Project not found');
  }

  return request.projectAccess.project.id;
}

function authenticatedUserId(request: AuthenticatedRequest): string {
  if (!request.authUserId) {
    throw new UnauthorizedException('A valid access token is required');
  }

  return request.authUserId;
}

@Controller('projects/:projectId/alert-rules')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
export class ProjectAlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  @Post()
  @RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
  create(
    @Req() request: ProjectAuthorizedRequest,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alertRulesService.create(authorizedProjectId(request), dto);
  }

  @Get()
  list(@Req() request: ProjectAuthorizedRequest) {
    return this.alertRulesService.list(authorizedProjectId(request));
  }
}

@Controller('alert-rules')
@UseGuards(AccessTokenGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  @Get(':alertRuleId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('alertRuleId', ParseUUIDPipe) alertRuleId: string,
  ) {
    return this.alertRulesService.getForMember(
      alertRuleId,
      authenticatedUserId(request),
    );
  }

  @Patch(':alertRuleId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('alertRuleId', ParseUUIDPipe) alertRuleId: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertRulesService.updateForManager(
      alertRuleId,
      authenticatedUserId(request),
      dto,
    );
  }

  @Delete(':alertRuleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('alertRuleId', ParseUUIDPipe) alertRuleId: string,
  ) {
    return this.alertRulesService.deleteForManager(
      alertRuleId,
      authenticatedUserId(request),
    );
  }
}
