import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [AuthModule, ProjectsModule, PrismaModule, RateLimitModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyAuthService, ApiKeyAuthGuard],
  exports: [ApiKeyAuthService, ApiKeyAuthGuard],
})
export class ApiKeysModule {}
