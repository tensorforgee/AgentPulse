import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectTracesController, TracesController } from './traces.controller';
import { TracesService } from './traces.service';

@Module({
  imports: [AuthModule, PrismaModule, ProjectsModule],
  controllers: [ProjectTracesController, TracesController],
  providers: [TracesService],
})
export class TracesModule {}
