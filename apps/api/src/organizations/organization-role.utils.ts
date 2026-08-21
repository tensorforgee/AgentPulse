import { ForbiddenException, SetMetadata } from '@nestjs/common';
import {
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from './organization.types';

export const ORGANIZATION_MANAGEMENT_ROLES = ['owner', 'admin'] as const;

export const REQUIRED_ORGANIZATION_ROLES = 'requiredOrganizationRoles';

export const RequireOrganizationRoles = (...roles: OrganizationRole[]) =>
  SetMetadata(REQUIRED_ORGANIZATION_ROLES, roles);

export function isOrganizationRole(role: string): role is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(role);
}

export function assertOrganizationRole(
  role: OrganizationRole,
  allowedRoles: readonly OrganizationRole[],
): void {
  if (!allowedRoles.includes(role)) {
    throw new ForbiddenException('Insufficient organization permissions');
  }
}
