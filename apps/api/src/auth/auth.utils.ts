import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function refreshTokenMatches(
  token: string,
  storedHash: string,
): boolean {
  const actual = Buffer.from(hashRefreshToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
