import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit.constants';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RcaService } from './rca.service';

@Controller('traces')
@UseGuards(AccessTokenGuard, RateLimitGuard)
export class RcaController {
  constructor(private readonly rca: RcaService) {}

  @Post(':traceId/rca')
  @RateLimit(RATE_LIMIT_POLICY.rca)
  analyze(
    @Req() request: AuthenticatedRequest,
    @Param('traceId', ParseUUIDPipe) traceId: string,
  ) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    return this.rca.analyze(traceId, request.authUserId);
  }
}
