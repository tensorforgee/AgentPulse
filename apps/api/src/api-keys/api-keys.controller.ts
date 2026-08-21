import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { ProjectTenantGuard } from '../projects/project-tenant.guard';
import type { ProjectAuthorizedRequest } from '../projects/project.types';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

function authorizedProjectId(request: ProjectAuthorizedRequest): string {
  if (!request.projectAccess) {
    throw new NotFoundException('Project not found');
  }

  return request.projectAccess.project.id;
}

@Controller('projects/:projectId/api-keys')
@UseGuards(AccessTokenGuard, ProjectTenantGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(
    @Req() request: ProjectAuthorizedRequest,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(authorizedProjectId(request), dto);
  }

  @Get()
  list(@Req() request: ProjectAuthorizedRequest) {
    return this.apiKeysService.list(authorizedProjectId(request));
  }

  @Post(':apiKeyId/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Req() request: ProjectAuthorizedRequest,
    @Param('apiKeyId', ParseUUIDPipe) apiKeyId: string,
  ) {
    return this.apiKeysService.revoke(authorizedProjectId(request), apiKeyId);
  }
}
