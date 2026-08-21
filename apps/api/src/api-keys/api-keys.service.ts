import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import { apiKeyMetadataSelect } from './api-key.types';
import { generateApiKey } from './api-key.utils';

const API_KEY_GENERATION_ATTEMPTS = 3;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateApiKeyDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    for (let attempt = 0; attempt < API_KEY_GENERATION_ATTEMPTS; attempt += 1) {
      const generated = generateApiKey();

      try {
        const metadata = await this.prisma.apiKey.create({
          data: {
            projectId,
            name: dto.name.trim(),
            prefix: generated.prefix,
            hashedKey: generated.digest,
            expiresAt,
          },
          select: apiKeyMetadataSelect,
        });

        return { ...metadata, key: generated.plaintext };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Could not generate a unique API key',
    );
  }

  list(projectId: string) {
    return this.prisma.apiKey.findMany({
      where: { projectId },
      select: apiKeyMetadataSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(projectId: string, apiKeyId: string) {
    const result = await this.prisma.apiKey.updateMany({
      where: { id: apiKeyId, projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new NotFoundException('API key not found');
    }

    return this.prisma.apiKey.findUniqueOrThrow({
      where: { id: apiKeyId },
      select: apiKeyMetadataSelect,
    });
  }
}
