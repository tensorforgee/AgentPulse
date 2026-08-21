import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { projectSelect, type ProjectAuthorizedRequest } from './project.types';

@Injectable()
export class ProjectTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ProjectAuthorizedRequest>();
    const userId = request.authUserId;
    const projectId = request.params.projectId;

    if (!userId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    if (typeof projectId !== 'string' || !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization: { memberships: { some: { userId } } },
      },
      select: projectSelect,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    request.projectAccess = { project };
    return true;
  }
}
