export const RATE_LIMIT_POLICY = {
  authSignup: 'auth-signup',
  authLogin: 'auth-login',
  authRefresh: 'auth-refresh',
  apiKeyInvalid: 'api-key-invalid',
  ingestion: 'ingestion',
  rca: 'rca',
} as const;

export type RateLimitPolicy =
  (typeof RATE_LIMIT_POLICY)[keyof typeof RATE_LIMIT_POLICY];
