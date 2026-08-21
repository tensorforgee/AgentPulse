import { Module } from '@nestjs/common';
import { AlertRulesModule } from '../alert-rules/alert-rules.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { PostIngestProcessorService } from './post-ingest-processor.service';

@Module({
  imports: [ApiKeysModule, PrismaModule, AlertRulesModule, RealtimeModule],
  controllers: [IngestionController],
  providers: [IngestionService, PostIngestProcessorService],
})
export class IngestionModule {}
