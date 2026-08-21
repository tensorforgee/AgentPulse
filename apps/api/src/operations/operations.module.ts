import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { JsonLoggerService } from './json-logger.service';
import { OperationalExceptionFilter } from './operational-exception.filter';
import { RequestDiagnosticsMiddleware } from './request-diagnostics.middleware';

@Module({
  controllers: [HealthController],
  providers: [
    JsonLoggerService,
    HealthService,
    RequestDiagnosticsMiddleware,
    {
      provide: APP_FILTER,
      useClass: OperationalExceptionFilter,
    },
  ],
  exports: [JsonLoggerService],
})
export class OperationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestDiagnosticsMiddleware).forRoutes('*');
  }
}
