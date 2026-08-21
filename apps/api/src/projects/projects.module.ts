import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationProjectsController } from './organization-projects.controller';
import { ProjectTenantGuard } from './project-tenant.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, OrganizationsModule, PrismaModule],
  controllers: [OrganizationProjectsController, ProjectsController],
  providers: [ProjectsService, ProjectTenantGuard],
  exports: [ProjectTenantGuard],
})
export class ProjectsModule {}
