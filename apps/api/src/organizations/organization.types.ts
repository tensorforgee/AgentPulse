import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth/auth.types';

export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  subscriptionStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

export type OrganizationSummary = Prisma.OrganizationGetPayload<{
  select: typeof organizationSelect;
}>;

export interface OrganizationAuthorizedRequest extends AuthenticatedRequest {
  organizationAccess?: {
    organization: OrganizationSummary;
    role: OrganizationRole;
  };
}
