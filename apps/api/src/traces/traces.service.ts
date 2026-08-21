import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListTracesQueryDto } from './dto/list-traces-query.dto';

const traceListSelect = {
  id: true,
  projectId: true,
  agentName: true,
  name: true,
  status: true,
  startedAt: true,
  endedAt: true,
  durationMs: true,
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  totalCost: true,
  metadata: true,
  errorType: true,
  errorMessage: true,
  createdAt: true,
} satisfies Prisma.TraceSelect;

const spanSelect = {
  id: true,
  traceId: true,
  parentSpanId: true,
  name: true,
  spanType: true,
  status: true,
  startedAt: true,
  endedAt: true,
  latencyMs: true,
  input: true,
  output: true,
  provider: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  estimatedCost: true,
  attributes: true,
  errorType: true,
  errorMessage: true,
  errorStack: true,
  createdAt: true,
} satisfies Prisma.SpanSelect;

const traceDetailSelect = {
  ...traceListSelect,
  spans: {
    select: spanSelect,
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TraceSelect;

type TraceListRecord = Prisma.TraceGetPayload<{
  select: typeof traceListSelect;
}>;
type TraceDetailRecord = Prisma.TraceGetPayload<{
  select: typeof traceDetailSelect;
}>;
type SpanRecord = Prisma.SpanGetPayload<{ select: typeof spanSelect }>;

@Injectable()
export class TracesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, query: ListTracesQueryDto) {
    const where = this.listWhere(projectId, query);
    const skip = (query.page - 1) * query.pageSize;
    const [records, total] = await this.prisma.$transaction([
      this.prisma.trace.findMany({
        where,
        select: traceListSelect,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.trace.count({ where }),
    ]);
    const totalPages = Math.ceil(total / query.pageSize);

    return {
      data: records.map(serializeTrace),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPreviousPage: query.page > 1 && total > 0,
      },
    };
  }

  async getForMember(traceId: string, userId: string) {
    const record = await this.prisma.trace.findFirst({
      where: {
        id: traceId,
        project: {
          organization: { memberships: { some: { userId } } },
        },
      },
      select: traceDetailSelect,
    });

    if (!record) {
      throw new NotFoundException('Trace not found');
    }

    return {
      ...serializeTrace(record),
      spans: record.spans.map(serializeSpan),
    };
  }

  private listWhere(
    projectId: string,
    query: ListTracesQueryDto,
  ): Prisma.TraceWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const search = query.search?.trim();
    const searchFilters: Prisma.TraceWhereInput[] = search
      ? [
          ...(isUUID(search) ? [{ id: search }] : []),
          { agentName: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ]
      : [];

    return {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(from || to
        ? {
            startedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(searchFilters.length ? { OR: searchFilters } : {}),
    };
  }
}

function serializeTrace(record: TraceListRecord | TraceDetailRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    agentName: record.agentName,
    name: record.name,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    durationMs: serializeBigInt(record.durationMs),
    inputTokens: serializeBigInt(record.inputTokens),
    outputTokens: serializeBigInt(record.outputTokens),
    totalTokens: serializeBigInt(record.totalTokens),
    totalCost: record.totalCost.toString(),
    metadata: record.metadata,
    errorType: record.errorType,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeSpan(record: SpanRecord) {
  return {
    id: record.id,
    traceId: record.traceId,
    parentSpanId: record.parentSpanId,
    type: record.spanType,
    name: record.name,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    latencyMs: serializeBigInt(record.latencyMs),
    input: record.input,
    output: record.output,
    provider: record.provider,
    model: record.model,
    inputTokens: serializeBigInt(record.inputTokens),
    outputTokens: serializeBigInt(record.outputTokens),
    estimatedCost: record.estimatedCost.toString(),
    attributes: record.attributes,
    errorType: record.errorType,
    errorMessage: record.errorMessage,
    errorStack: record.errorStack,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeBigInt(value: bigint): number;
function serializeBigInt(value: bigint | null): number | null;
function serializeBigInt(value: bigint | null): number | null {
  if (value === null) {
    return null;
  }

  const serialized = Number(value);
  if (!Number.isSafeInteger(serialized)) {
    throw new InternalServerErrorException(
      'Telemetry integer exceeds the JSON safe integer range',
    );
  }
  return serialized;
}
