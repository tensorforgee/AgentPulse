import { Module } from '@nestjs/common';
import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OperationsModule } from './operations/operations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RcaModule } from './rca/rca.module';
import { TracesModule } from './traces/traces.module';

@Module({
  imports: [
    PrismaModule,
    OperationsModule,
    AuthModule,
    BillingModule,
    OrganizationsModule,
    ProjectsModule,
    AlertRulesModule,
    ApiKeysModule,
    IngestionModule,
    TracesModule,
    RcaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
