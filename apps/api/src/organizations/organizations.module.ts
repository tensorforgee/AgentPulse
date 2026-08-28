import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import {
  OrganizationInviteAcceptanceController,
  OrganizationMembersController,
} from './organization-members.controller';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    OrganizationsController,
    OrganizationMembersController,
    OrganizationInviteAcceptanceController,
  ],
  providers: [
    OrganizationsService,
    OrganizationMembersService,
    OrganizationMembershipGuard,
  ],
  exports: [OrganizationMembershipGuard],
})
export class OrganizationsModule {}
