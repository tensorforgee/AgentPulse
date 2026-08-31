import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import {
  ORGANIZATION_MANAGEMENT_ROLES,
  RequireOrganizationRoles,
} from '../organizations/organization-role.utils';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { AlertWebhookService } from './alert-webhook.service';
import { ConfigureAlertWebhookDto } from './dto/configure-alert-webhook.dto';

@Controller('projects/:projectId/alert-webhook')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
@RequireOrganizationRoles(...ORGANIZATION_MANAGEMENT_ROLES)
export class ProjectAlertWebhookController {
  constructor(private readonly webhooks: AlertWebhookService) {}

  @Get()
  status(@Req() request: ProjectAuthorizedRequest) {
    return this.webhooks.status(projectId(request));
  }

  @Put()
  configure(
    @Req() request: ProjectAuthorizedRequest,
    @Body() dto: ConfigureAlertWebhookDto,
  ) {
    return this.webhooks.configure(projectId(request), dto.url);
  }

  @Post('test')
  test(@Req() request: ProjectAuthorizedRequest) {
    return this.webhooks.test(projectId(request));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() request: ProjectAuthorizedRequest) {
    return this.webhooks.remove(projectId(request));
  }
}

function projectId(request: ProjectAuthorizedRequest): string {
  const id = request.projectAccess?.project.id;
  if (!id) {
    throw new NotFoundException('Project not found');
  }
  return id;
}
