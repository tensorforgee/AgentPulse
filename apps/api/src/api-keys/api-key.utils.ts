import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const API_KEY_PREFIX_LABEL = 'ap_live_';
const API_KEY_ID_BYTES = 6;
const API_KEY_SECRET_BYTES = 32;
const API_KEY_PATTERN = /^ap_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  digest: string;
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = `${API_KEY_PREFIX_LABEL}${randomBytes(API_KEY_ID_BYTES).toString('base64url')}`;
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString('base64url');
  const plaintext = `${prefix}_${secret}`;

  return {
    plaintext,
    prefix,
    digest: digestApiKey(plaintext),
  };
}

export function apiKeyPrefix(plaintext: string): string | null {
  return API_KEY_PATTERN.test(plaintext) ? plaintext.slice(0, 16) : null;
}

export function digestApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function apiKeyDigestMatches(
  plaintext: string,
  storedDigest: string,
): boolean {
  const actual = Buffer.from(digestApiKey(plaintext), 'hex');
  const expected = Buffer.from(storedDigest, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
