import type { PrismaService } from '../prisma/prisma.service';
import type { RcaProvider } from './rca-provider';
import { RcaService } from './rca.service';

const failedTrace = {
  id: 'c86ca45c-6fc1-46bd-a42e-d67fe4e5bb93',
  projectId: '2d170e1d-c0d1-4d91-8eb5-fbf9b125a37e',
  agentName: 'support-agent',
  name: 'Support request',
  status: 'failed',
  durationMs: 2000n,
  errorType: 'AgentError',
  errorMessage: 'Agent failed',
  spans: [
    {
      id: 'e90525d7-0f44-4374-a0a3-8ee63ac8b64d',
      parentSpanId: null,
      name: 'search-service',
      spanType: 'tool_call',
      status: 'failed',
      latencyMs: 1800n,
      provider: null,
      model: null,
      errorType: 'TimeoutError',
      errorMessage: 'Search timed out',
    },
  ],
};

describe('RcaService', () => {
  it('returns mocked provider analysis with the likely failing span', async () => {
    const analyze: jest.MockedFunction<RcaProvider['analyze']> = jest.fn(() =>
      Promise.resolve('The search dependency timed out.'),
    );
    const provider: RcaProvider = {
      isConfigured: jest.fn(() => true),
      analyze,
    };
    const prisma = {
      trace: { findFirst: jest.fn(() => Promise.resolve(failedTrace)) },
    } as unknown as PrismaService;
    const service = new RcaService(prisma, provider);

    await expect(
      service.analyze(failedTrace.id, 'user-id'),
    ).resolves.toMatchObject({
      status: 'complete',
      explanation: 'The search dependency timed out.',
      likelyFailingSpan: { name: 'search-service', type: 'tool_call' },
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].trace.id).toBe(failedTrace.id);
  });

  it('returns a local explanation when the provider is not configured', async () => {
    const analyze: jest.MockedFunction<RcaProvider['analyze']> = jest.fn();
    const provider: RcaProvider = {
      isConfigured: jest.fn(() => false),
      analyze,
    };
    const prisma = {
      trace: { findFirst: jest.fn(() => Promise.resolve(failedTrace)) },
    } as unknown as PrismaService;
    const service = new RcaService(prisma, provider);

    await expect(
      service.analyze(failedTrace.id, 'user-id'),
    ).resolves.toMatchObject({
      status: 'unavailable',
      providerConfigured: false,
    });
    expect(analyze).not.toHaveBeenCalled();
  });
});
