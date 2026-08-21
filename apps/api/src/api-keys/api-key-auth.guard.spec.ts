import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeyAuthService } from './api-key-auth.service';
import type { ApiKeyAuthenticatedRequest } from './api-key.types';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit.constants';
import type { RateLimitService } from '../rate-limit/rate-limit.service';

describe('ApiKeyAuthGuard', () => {
  const access = {
    apiKeyId: 'api-key-id',
    project: {
      id: 'project-id',
      organizationId: 'organization-id',
      name: 'Project',
      slug: 'project',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  function setup(authorization?: string) {
    const request = {
      headers: { authorization },
      ip: '127.0.0.1',
    } as ApiKeyAuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const authenticate = jest.fn().mockResolvedValue(access);
    const authService = { authenticate } as unknown as ApiKeyAuthService;
    const assertAllowed = jest.fn();
    const rateLimits = { assertAllowed } as unknown as RateLimitService;

    return {
      request,
      authenticate,
      assertAllowed,
      guard: new ApiKeyAuthGuard(authService, rateLimits),
      context,
    };
  }

  it('resolves and attaches project access from a bearer API key', async () => {
    const { request, authenticate, assertAllowed, guard, context } = setup(
      'Bearer ap_live_abcdefgh_secret',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('ap_live_abcdefgh_secret');
    expect(request.apiKeyAccess).toBe(access);
    expect(assertAllowed).toHaveBeenCalledWith(
      RATE_LIMIT_POLICY.ingestion,
      'project:project-id:api-key:api-key-id',
    );
  });

  it('rejects a missing bearer API key', async () => {
    const { authenticate, assertAllowed, guard, context } = setup();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate).not.toHaveBeenCalled();
    expect(assertAllowed).toHaveBeenCalledWith(
      RATE_LIMIT_POLICY.apiKeyInvalid,
      'ip:127.0.0.1',
    );
  });
});
