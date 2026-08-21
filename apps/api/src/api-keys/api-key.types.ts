import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import type { ProjectSummary } from '../projects/project.types';

export const apiKeyMetadataSelect = {
  id: true,
  projectId: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

export interface ApiKeyAuthenticatedRequest extends Request {
  apiKeyAccess?: {
    apiKeyId: string;
    project: ProjectSummary;
  };
}
