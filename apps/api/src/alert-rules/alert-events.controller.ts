import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { AlertEventsService } from './alert-events.service';

@Controller('projects/:projectId/alert-events')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
export class ProjectAlertEventsController {
  constructor(private readonly alertEvents: AlertEventsService) {}

  @Get()
  list(@Req() request: ProjectAuthorizedRequest) {
    const projectId = request.projectAccess?.project.id;
    if (!projectId) {
      throw new NotFoundException('Project not found');
    }

    return this.alertEvents.list(projectId);
  }
}

@Controller('alert-events')
@UseGuards(AccessTokenGuard)
export class AlertEventsController {
  constructor(private readonly alertEvents: AlertEventsService) {}

  @Get(':alertEventId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('alertEventId', ParseUUIDPipe) alertEventId: string,
  ) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    return this.alertEvents.getForMember(alertEventId, request.authUserId);
  }
}
