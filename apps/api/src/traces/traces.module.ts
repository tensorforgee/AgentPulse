import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { TraceAggregatesService } from './trace-aggregates.service';
import { ProjectTracesController, TracesController } from './traces.controller';
import { TracesService } from './traces.service';

@Module({
  imports: [AuthModule, PrismaModule, ProjectsModule],
  controllers: [ProjectTracesController, TracesController],
  providers: [TraceAggregatesService, TracesService],
  exports: [TraceAggregatesService],
})
export class TracesModule {}
