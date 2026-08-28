import { createHash, randomBytes } from 'node:crypto';

export const ORGANIZATION_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createOrganizationInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestOrganizationInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
