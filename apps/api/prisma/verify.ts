import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database verification');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const suffix = randomUUID();
  let organizationId: string | undefined;
  let userId: string | undefined;

  try {
    const [spanParentConstraint] = await prisma.$queryRawUnsafe<
      Array<{ definition: string }>
    >(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'spans_trace_id_parent_span_id_fkey'
    `);

    if (
      !spanParentConstraint?.definition.includes(
        'FOREIGN KEY (trace_id, parent_span_id)',
      ) ||
      !spanParentConstraint.definition.includes(
        'ON DELETE SET NULL (parent_span_id)',
      )
    ) {
      throw new Error('Span parent foreign key is not tenant-safe');
    }

    const user = await prisma.user.create({
      data: {
        email: `prisma-verification-${suffix}@example.invalid`,
        passwordHash: 'verification-hash-not-a-raw-password',
        displayName: 'Prisma Verification',
      },
    });
    userId = user.id;

    const organization = await prisma.organization.create({
      data: {
        name: 'Prisma Verification Organization',
        slug: `prisma-verification-${suffix}`,
      },
    });
    organizationId = organization.id;

    await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: 'Prisma Verification Project',
        slug: 'prisma-verification',
      },
    });

    await prisma.apiKey.create({
      data: {
        projectId: project.id,
        name: 'Verification Key',
        prefix: 'ap_verify',
        hashedKey: `sha256:verification-only:${suffix}`,
      },
    });

    const now = new Date();
    const trace = await prisma.trace.create({
      data: {
        projectId: project.id,
        agentName: 'prisma-verification-agent',
        name: 'Database verification trace',
        status: 'success',
        startedAt: now,
        endedAt: now,
        durationMs: 0n,
        inputTokens: 10n,
        outputTokens: 5n,
        totalTokens: 15n,
        totalCost: '0.00010000',
        metadata: { verification: true },
      },
    });

    const parent = await prisma.span.create({
      data: {
        traceId: trace.id,
        name: 'Verification LLM call',
        spanType: 'llm_call',
        status: 'success',
        startedAt: now,
        endedAt: now,
        latencyMs: 0n,
        input: { promptCaptured: false },
        output: { responseCaptured: false },
        provider: 'verification',
        model: 'verification-model',
        inputTokens: 10n,
        outputTokens: 5n,
        estimatedCost: '0.00010000',
        attributes: { verification: true },
      },
    });

    const child = await prisma.span.create({
      data: {
        traceId: trace.id,
        parentSpanId: parent.id,
        name: 'Verification retrieval',
        spanType: 'retrieval',
        status: 'success',
        startedAt: now,
        endedAt: now,
        latencyMs: 0n,
      },
    });

    const storedTrace = await prisma.trace.findUniqueOrThrow({
      where: { id: trace.id },
      include: {
        project: true,
        spans: {
          include: {
            parent: true,
          },
        },
      },
    });

    const storedChild = storedTrace.spans.find((span) => span.id === child.id);
    if (
      storedTrace.project.organizationId !== organization.id ||
      storedTrace.totalTokens !== 15n ||
      storedTrace.spans.length !== 2 ||
      storedChild?.parent?.id !== parent.id
    ) {
      throw new Error('Database verification read did not match created data');
    }

    console.log('Database verification passed: core graph created and read');
  } finally {
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}

void main();
