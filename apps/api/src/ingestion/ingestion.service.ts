import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  assertTraceWithSpansContract,
  type SpanContract,
  TelemetryValidationError,
  type TraceWithSpansContract,
} from '@agentpulse/shared';
import { Prisma } from '../generated/prisma/client';
import { AlertEvaluationService } from '../alert-rules/alert-evaluation.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertEvaluation: AlertEvaluationService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async ingest(projectId: string, payload: unknown) {
    const telemetry = this.validatePayload(projectId, payload);
    const orderedSpans = this.orderParentsBeforeChildren(telemetry.spans);

    await this.prisma.$transaction(async (transaction) => {
      const existingTrace = await transaction.trace.findUnique({
        where: { id: telemetry.id },
        select: { projectId: true },
      });

      if (existingTrace && existingTrace.projectId !== projectId) {
        throw new ConflictException(
          'Trace ID already belongs to another project',
        );
      }

      const spanIds = orderedSpans.map((span) => span.id);
      const existingSpans = spanIds.length
        ? await transaction.span.findMany({
            where: { id: { in: spanIds } },
            select: { id: true, traceId: true },
          })
        : [];
      const conflictingSpan = existingSpans.find(
        (span) => span.traceId !== telemetry.id,
      );

      if (conflictingSpan) {
        throw new ConflictException(
          `Span ID ${conflictingSpan.id} already belongs to another trace`,
        );
      }

      const traceData = this.traceData(telemetry);
      await transaction.trace.upsert({
        where: { id: telemetry.id },
        create: {
          id: telemetry.id,
          projectId,
          ...traceData,
        },
        update: traceData,
      });

      for (const span of orderedSpans) {
        const spanData = this.spanData(span);
        await transaction.span.upsert({
          where: { id: span.id },
          create: {
            id: span.id,
            traceId: telemetry.id,
            ...spanData,
          },
          update: spanData,
        });
      }
    });

    this.realtime.publish(projectId, 'telemetry.ingested', {
      traceId: telemetry.id,
      status: telemetry.status,
      spansProcessed: orderedSpans.length,
    });
    try {
      await this.alertEvaluation.evaluate(projectId, telemetry.id);
    } catch {
      // Telemetry is already durable. Alerting must never turn a successful
      // ingestion into an error or corrupt the persisted trace transaction.
      this.logger.error(
        `Alert evaluation failed after ingesting trace ${telemetry.id}`,
      );
    }

    return {
      traceId: telemetry.id,
      spansProcessed: orderedSpans.length,
    };
  }

  private validatePayload(
    projectId: string,
    payload: unknown,
  ): TraceWithSpansContract {
    if (!this.isRecord(payload)) {
      throw new BadRequestException('Telemetry payload must be an object');
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'projectId')) {
      throw new BadRequestException(
        'projectId must not be provided; it is resolved from the API key',
      );
    }

    const authenticatedPayload = { ...payload, projectId };

    try {
      assertTraceWithSpansContract(authenticatedPayload);
      return authenticatedPayload;
    } catch (error) {
      if (error instanceof TelemetryValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private orderParentsBeforeChildren(
    spans: readonly SpanContract[],
  ): SpanContract[] {
    const spansById = new Map(spans.map((span) => [span.id, span]));
    const visited = new Set<string>();
    const ordered: SpanContract[] = [];

    const visit = (span: SpanContract) => {
      if (visited.has(span.id)) {
        return;
      }

      if (span.parentSpanId) {
        const parent = spansById.get(span.parentSpanId);
        if (parent) {
          visit(parent);
        }
      }

      visited.add(span.id);
      ordered.push(span);
    };

    spans.forEach(visit);
    return ordered;
  }

  private traceData(telemetry: TraceWithSpansContract) {
    return {
      agentName: telemetry.agentName,
      name: telemetry.name ?? null,
      status: telemetry.status,
      startedAt: new Date(telemetry.startedAt),
      endedAt: telemetry.endedAt ? new Date(telemetry.endedAt) : null,
      durationMs:
        telemetry.durationMs === undefined || telemetry.durationMs === null
          ? null
          : BigInt(telemetry.durationMs),
      inputTokens: BigInt(telemetry.inputTokens),
      outputTokens: BigInt(telemetry.outputTokens),
      totalTokens: BigInt(telemetry.totalTokens),
      totalCost: telemetry.totalCost,
      metadata: this.requiredJson(telemetry.metadata),
      errorType: telemetry.errorType ?? null,
      errorMessage: telemetry.errorMessage ?? null,
    };
  }

  private spanData(span: SpanContract) {
    return {
      parentSpanId: span.parentSpanId ?? null,
      name: span.name,
      spanType: span.type,
      status: span.status,
      provider: span.provider ?? null,
      model: span.model ?? null,
      startedAt: new Date(span.startedAt),
      endedAt: span.endedAt ? new Date(span.endedAt) : null,
      latencyMs: span.latencyMs ?? null,
      input: this.nullableJson(span.input),
      output: this.nullableJson(span.output),
      inputTokens: BigInt(span.inputTokens),
      outputTokens: BigInt(span.outputTokens),
      estimatedCost: span.estimatedCost,
      errorType: span.errorType ?? null,
      errorMessage: span.errorMessage ?? null,
      errorStack: span.errorStack ?? null,
      attributes: this.requiredJson(span.attributes),
    };
  }

  private requiredJson(value: unknown): Prisma.InputJsonValue {
    return value ?? {};
  }

  private nullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    return value === undefined || value === null ? Prisma.DbNull : value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
