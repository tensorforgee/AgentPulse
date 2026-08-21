import type { AuthenticatedRequest } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';

export const projectSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

export type ProjectSummary = Prisma.ProjectGetPayload<{
  select: typeof projectSelect;
}>;

export interface ProjectAuthorizedRequest extends AuthenticatedRequest {
  projectAccess?: {
    project: ProjectSummary;
  };
}
