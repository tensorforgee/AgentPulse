import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { RealtimeEventsController } from './realtime-events.controller';
import { RealtimeEventsService } from './realtime-events.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RealtimeEventsController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
