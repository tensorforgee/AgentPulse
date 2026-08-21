import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import { projectSelect } from './project.types';
import { normalizeProjectSlug } from './project.utils';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateProjectDto) {
    try {
      return await this.prisma.project.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          slug: normalizeProjectSlug(dto.slug),
          description: dto.description?.trim() || null,
        },
        select: projectSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A project with this slug already exists in the organization',
        );
      }

      throw error;
    }
  }

  listForOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      select: projectSelect,
      orderBy: { createdAt: 'desc' },
    });
  }
}
