import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { projectSelect } from '../projects/project.types';
import { apiKeyDigestMatches, apiKeyPrefix } from './api-key.utils';

@Injectable()
export class ApiKeyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(plaintext: string) {
    const prefix = apiKeyPrefix(plaintext);

    if (!prefix) {
      throw new UnauthorizedException('Invalid API key');
    }

    const now = new Date();
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        prefix,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        hashedKey: true,
        project: { select: projectSelect },
      },
    });
    const matched = candidates.find(({ hashedKey }) =>
      apiKeyDigestMatches(plaintext, hashedKey),
    );

    if (!matched) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.prisma.apiKey.update({
      where: { id: matched.id },
      data: { lastUsedAt: now },
    });

    return {
      apiKeyId: matched.id,
      project: matched.project,
    };
  }
}
