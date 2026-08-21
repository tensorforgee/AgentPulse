import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  RATE_LIMIT_POLICY,
  type RateLimitPolicy,
} from './rate-limit.constants';
import { RATE_LIMIT_POLICY_METADATA } from './rate-limit.decorator';
import { clientIp, RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (policy === RATE_LIMIT_POLICY.rca) {
      if (!request.authUserId) {
        throw new UnauthorizedException('A valid access token is required');
      }
      this.rateLimits.assertAllowed(policy, `user:${request.authUserId}`);
      return true;
    }

    this.rateLimits.assertAllowed(policy, `ip:${clientIp(request)}`);
    return true;
  }
}
