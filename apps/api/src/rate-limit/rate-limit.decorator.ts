import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicy } from './rate-limit.constants';

export const RATE_LIMIT_POLICY_METADATA = 'agentpulse:rate-limit-policy';

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_POLICY_METADATA, policy);
