import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { ListTracesQueryDto } from './dto/list-traces-query.dto';
import { TracesService } from './traces.service';

@Controller('projects/:projectId/traces')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
export class ProjectTracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Get('metrics')
  metrics(@Req() request: ProjectAuthorizedRequest) {
    const projectId = request.projectAccess?.project.id;
    if (!projectId) {
      throw new NotFoundException('Project not found');
    }

    return this.tracesService.metrics(projectId);
  }

  @Get()
  list(
    @Req() request: ProjectAuthorizedRequest,
    @Query() query: ListTracesQueryDto,
  ) {
    const projectId = request.projectAccess?.project.id;
    if (!projectId) {
      throw new NotFoundException('Project not found');
    }

    return this.tracesService.list(projectId, query);
  }
}

@Controller('traces')
@UseGuards(AccessTokenGuard)
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Get(':traceId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('traceId', ParseUUIDPipe) traceId: string,
  ) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    return this.tracesService.getForMember(traceId, request.authUserId);
  }
}
