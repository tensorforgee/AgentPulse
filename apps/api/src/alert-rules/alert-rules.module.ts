import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TracesModule } from '../traces/traces.module';
import {
  AlertEventsController,
  ProjectAlertEventsController,
} from './alert-events.controller';
import { AlertEventsService } from './alert-events.service';
import { AlertDeliveryService } from './alert-delivery.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import {
  AlertRulesController,
  ProjectAlertRulesController,
} from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

@Module({
  imports: [
    AuthModule,
    ProjectsModule,
    PrismaModule,
    RealtimeModule,
    TracesModule,
  ],
  controllers: [
    ProjectAlertRulesController,
    AlertRulesController,
    ProjectAlertEventsController,
    AlertEventsController,
  ],
  providers: [
    AlertRulesService,
    AlertEventsService,
    AlertDeliveryService,
    AlertEvaluationService,
  ],
  exports: [AlertEvaluationService],
})
export class AlertRulesModule {}
