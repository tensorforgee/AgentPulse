import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RCA_PROVIDER,
  type RcaProvider,
  type RcaProviderInput,
  type RcaSpanContext,
} from './rca-provider';

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RCA_PROVIDER) private readonly provider: RcaProvider,
  ) {}

  async analyze(traceId: string, userId: string) {
    const trace = await this.prisma.trace.findFirst({
      where: {
        id: traceId,
        project: {
          organization: { memberships: { some: { userId } } },
        },
      },
      select: {
        id: true,
        projectId: true,
        agentName: true,
        name: true,
        status: true,
        durationMs: true,
        errorType: true,
        errorMessage: true,
        spans: {
          select: {
            id: true,
            parentSpanId: true,
            name: true,
            spanType: true,
            status: true,
            latencyMs: true,
            provider: true,
            model: true,
            errorType: true,
            errorMessage: true,
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!trace) {
      throw new NotFoundException('Trace not found');
    }
    if (trace.status !== 'failed') {
      throw new BadRequestException('RCA is available only for failed traces');
    }

    const spans: RcaSpanContext[] = trace.spans.map((span) => ({
      id: span.id,
      parentSpanId: span.parentSpanId,
      name: span.name,
      type: span.spanType,
      status: span.status,
      latencyMs: span.latencyMs?.toString() ?? null,
      provider: span.provider,
      model: span.model,
      errorType: span.errorType,
      errorMessage: span.errorMessage,
    }));
    const likelySpan = spans.find(({ status }) => status === 'failed') ?? null;
    const input: RcaProviderInput = {
      trace: {
        id: trace.id,
        agentName: trace.agentName,
        name: trace.name,
        status: trace.status,
        durationMs: trace.durationMs?.toString() ?? null,
        errorType: trace.errorType,
        errorMessage: trace.errorMessage,
      },
      spans,
    };
    const fallback = fallbackExplanation(input, likelySpan);

    if (!this.provider.isConfigured()) {
      return result('unavailable', fallback, likelySpan, false);
    }

    try {
      const explanation = await this.provider.analyze(input);
      return result('complete', explanation, likelySpan, true);
    } catch {
      this.logger.warn(`RCA provider request failed for trace ${trace.id}`);
      return result('provider_error', fallback, likelySpan, true);
    }
  }
}

function result(
  status: 'complete' | 'unavailable' | 'provider_error',
  explanation: string,
  likelySpan: RcaSpanContext | null,
  providerConfigured: boolean,
) {
  return {
    status,
    providerConfigured,
    explanation,
    likelyFailingSpan: likelySpan
      ? {
          id: likelySpan.id,
          name: likelySpan.name,
          type: likelySpan.type,
          errorType: likelySpan.errorType,
          errorMessage: likelySpan.errorMessage,
        }
      : null,
  };
}

function fallbackExplanation(
  input: RcaProviderInput,
  likelySpan: RcaSpanContext | null,
): string {
  if (likelySpan) {
    const reason =
      likelySpan.errorMessage ??
      likelySpan.errorType ??
      input.trace.errorMessage ??
      'an unspecified span failure';
    return `The run most likely failed in ${likelySpan.name} (${likelySpan.type}) because of ${reason}. Check that span's dependency, timeout, and captured error details.`;
  }

  const reason =
    input.trace.errorMessage ?? input.trace.errorType ?? 'an unspecified error';
  return `The trace failed because of ${reason}. No failed span was captured, so check trace-level logs and instrumentation coverage.`;
}
