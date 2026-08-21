import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyAuthGuard } from '../api-keys/api-key-auth.guard';
import type { ApiKeyAuthenticatedRequest } from '../api-keys/api-key.types';
import { IngestionService } from './ingestion.service';

@Controller('v1')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('ingest')
  @UseGuards(ApiKeyAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  ingest(@Req() request: ApiKeyAuthenticatedRequest, @Body() payload: unknown) {
    const projectId = request.apiKeyAccess?.project.id;

    if (!projectId) {
      throw new UnauthorizedException('Invalid API key');
    }

    return this.ingestionService.ingest(projectId, payload);
  }
}
