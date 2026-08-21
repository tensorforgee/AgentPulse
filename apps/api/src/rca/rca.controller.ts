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
import { RcaService } from './rca.service';

@Controller('traces')
@UseGuards(AccessTokenGuard)
export class RcaController {
  constructor(private readonly rca: RcaService) {}

  @Post(':traceId/rca')
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
