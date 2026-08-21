import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyAuthService } from './api-key-auth.service';
import type { ApiKeyAuthenticatedRequest } from './api-key.types';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeyAuthService: ApiKeyAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ApiKeyAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, plaintext, extra] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !plaintext || extra) {
      throw new UnauthorizedException('A valid API key is required');
    }

    request.apiKeyAccess = await this.apiKeyAuthService.authenticate(plaintext);
    return true;
  }
}
