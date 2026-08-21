import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMembershipGuard],
  exports: [OrganizationMembershipGuard],
})
export class OrganizationsModule {}
