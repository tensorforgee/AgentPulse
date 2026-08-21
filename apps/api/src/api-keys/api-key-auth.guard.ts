import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyAuthService } from './api-key-auth.service';
import type { ApiKeyAuthenticatedRequest } from './api-key.types';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit.constants';
import { clientIp, RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeyAuthService: ApiKeyAuthService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ApiKeyAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, plaintext, extra] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !plaintext || extra) {
      this.rateLimits.assertAllowed(
        RATE_LIMIT_POLICY.apiKeyInvalid,
        `ip:${clientIp(request)}`,
      );
      throw new UnauthorizedException('A valid API key is required');
    }

    try {
      request.apiKeyAccess =
        await this.apiKeyAuthService.authenticate(plaintext);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.rateLimits.assertAllowed(
          RATE_LIMIT_POLICY.apiKeyInvalid,
          `ip:${clientIp(request)}`,
        );
      }
      throw error;
    }

    this.rateLimits.assertAllowed(
      RATE_LIMIT_POLICY.ingestion,
      `project:${request.apiKeyAccess.project.id}:api-key:${request.apiKeyAccess.apiKeyId}`,
    );
    return true;
  }
}
