import 'dotenv/config';
import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  RATE_LIMIT_POLICY,
  type RateLimitPolicy,
} from './rate-limit.constants';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitPolicyConfig {
  limit: number;
  windowMs: number;
}

type RateLimitPolicyConfigs = Record<RateLimitPolicy, RateLimitPolicyConfig>;

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 10_000;
const PRUNE_INTERVAL = 256;

function positiveInteger(name: string, fallback: number): number {
  const configured = process.env[name];
  if (configured === undefined || configured.trim() === '') {
    return fallback;
  }

  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function policyConfig(
  limitEnvironmentName: string,
  defaultLimit: number,
  windowEnvironmentName: string,
): RateLimitPolicyConfig {
  return {
    limit: positiveInteger(limitEnvironmentName, defaultLimit),
    windowMs: positiveInteger(windowEnvironmentName, DEFAULT_WINDOW_MS),
  };
}

function loadPolicyConfigs(): RateLimitPolicyConfigs {
  return {
    [RATE_LIMIT_POLICY.authSignup]: policyConfig(
      'RATE_LIMIT_AUTH_SIGNUP_MAX',
      5,
      'RATE_LIMIT_AUTH_WINDOW_MS',
    ),
    [RATE_LIMIT_POLICY.authLogin]: policyConfig(
      'RATE_LIMIT_AUTH_LOGIN_MAX',
      10,
      'RATE_LIMIT_AUTH_WINDOW_MS',
    ),
    [RATE_LIMIT_POLICY.authRefresh]: policyConfig(
      'RATE_LIMIT_AUTH_REFRESH_MAX',
      30,
      'RATE_LIMIT_AUTH_WINDOW_MS',
    ),
    [RATE_LIMIT_POLICY.apiKeyInvalid]: policyConfig(
      'RATE_LIMIT_API_KEY_INVALID_MAX',
      30,
      'RATE_LIMIT_API_KEY_INVALID_WINDOW_MS',
    ),
    [RATE_LIMIT_POLICY.ingestion]: policyConfig(
      'RATE_LIMIT_INGEST_MAX',
      600,
      'RATE_LIMIT_INGEST_WINDOW_MS',
    ),
    [RATE_LIMIT_POLICY.rca]: policyConfig(
      'RATE_LIMIT_RCA_MAX',
      10,
      'RATE_LIMIT_RCA_WINDOW_MS',
    ),
  };
}

export function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly configs = loadPolicyConfigs();
  private readonly maxBuckets = positiveInteger(
    'RATE_LIMIT_MAX_BUCKETS',
    DEFAULT_MAX_BUCKETS,
  );
  private requestsSincePrune = 0;

  assertAllowed(policy: RateLimitPolicy, identity: string): void {
    const now = Date.now();
    const config = this.configs[policy];
    const key = `${policy}:${identity}`;
    this.pruneIfNeeded(now);

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.reserveBucketCapacity(now);
      this.buckets.set(key, { count: 1, resetAt: now + config.windowMs });
      return;
    }

    if (existing.count >= config.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }

  onModuleDestroy(): void {
    this.buckets.clear();
  }

  private pruneIfNeeded(now: number): void {
    this.requestsSincePrune += 1;
    if (this.requestsSincePrune < PRUNE_INTERVAL) {
      return;
    }

    this.requestsSincePrune = 0;
    this.pruneExpired(now);
  }

  private reserveBucketCapacity(now: number): void {
    if (this.buckets.size < this.maxBuckets) {
      return;
    }

    this.pruneExpired(now);
    if (this.buckets.size < this.maxBuckets) {
      return;
    }

    const oldestKey = this.buckets.keys().next().value as string | undefined;
    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
