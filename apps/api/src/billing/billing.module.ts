import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingUsageService } from './billing-usage.service';
import { StripeGateway } from './stripe.gateway';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [AuthModule, OrganizationsModule, PrismaModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, BillingUsageService, StripeGateway],
  exports: [BillingService, BillingUsageService],
})
export class BillingModule {}
