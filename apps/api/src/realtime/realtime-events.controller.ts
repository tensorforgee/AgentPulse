import {
  Controller,
  NotFoundException,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { RealtimeEventsService } from './realtime-events.service';

@Controller('projects/:projectId/events')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
export class RealtimeEventsController {
  constructor(private readonly realtimeEvents: RealtimeEventsService) {}

  @Sse()
  stream(@Req() request: ProjectAuthorizedRequest) {
    const projectId = request.projectAccess?.project.id;
    if (!projectId) {
      throw new NotFoundException('Project not found');
    }

    return this.realtimeEvents.stream(projectId);
  }
}
