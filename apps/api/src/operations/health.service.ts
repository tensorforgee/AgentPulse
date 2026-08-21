import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLoggerService } from './json-logger.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLoggerService,
  ) {}

  liveness() {
    return { status: 'ok' as const };
  }

  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok' as const,
        checks: { database: 'up' as const },
      };
    } catch {
      this.logger.logEvent('error', 'health.readiness.failed', {
        dependency: 'postgresql',
      });
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      });
    }
  }
}
