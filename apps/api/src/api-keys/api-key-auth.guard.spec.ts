import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeyAuthService } from './api-key-auth.service';
import type { ApiKeyAuthenticatedRequest } from './api-key.types';

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
    } as ApiKeyAuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const authenticate = jest.fn().mockResolvedValue(access);
    const authService = { authenticate } as unknown as ApiKeyAuthService;

    return {
      request,
      authenticate,
      guard: new ApiKeyAuthGuard(authService),
      context,
    };
  }

  it('resolves and attaches project access from a bearer API key', async () => {
    const { request, authenticate, guard, context } = setup(
      'Bearer ap_live_abcdefgh_secret',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('ap_live_abcdefgh_secret');
    expect(request.apiKeyAccess).toBe(access);
  });

  it('rejects a missing bearer API key', async () => {
    const { authenticate, guard, context } = setup();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });
});
