import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { ProjectTenantGuard } from './project-tenant.guard';
import type { ProjectAuthorizedRequest } from './project.types';

@Controller('projects')
@UseGuards(AccessTokenGuard)
export class ProjectsController {
  @Get(':projectId')
  @UseGuards(ProjectTenantGuard)
  get(@Req() request: ProjectAuthorizedRequest) {
    if (!request.projectAccess) {
      throw new NotFoundException('Project not found');
    }

    return request.projectAccess.project;
  }
}
