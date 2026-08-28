import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  organizationSelect,
  type OrganizationRole,
} from './organization.types';
import { normalizeOrganizationSlug } from './organization.utils';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const slug = normalizeOrganizationSlug(dto.slug);

    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name: dto.name.trim(), slug },
          select: organizationSelect,
        });

        await tx.organizationMember.create({
          data: {
            organizationId: created.id,
            userId,
            role: 'owner',
          },
        });

        return created;
      });

      return { ...organization, role: 'owner' as const };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this slug already exists',
        );
      }

      throw error;
    }
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: {
        role: true,
        organization: { select: organizationSelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map(({ organization, role }) => ({
      ...organization,
      role: role as OrganizationRole,
    }));
  }

  async update(
    organizationId: string,
    role: OrganizationRole,
    dto: UpdateOrganizationDto,
  ) {
    try {
      const organization = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.slug !== undefined
            ? { slug: normalizeOrganizationSlug(dto.slug) }
            : {}),
        },
        select: organizationSelect,
      });
      return { ...organization, role };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this slug already exists',
        );
      }
      throw error;
    }
  }
}
