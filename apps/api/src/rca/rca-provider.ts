export const RCA_PROVIDER = Symbol('RCA_PROVIDER');

export interface RcaSpanContext {
  id: string;
  parentSpanId: string | null;
  name: string;
  type: string;
  status: string;
  latencyMs: string | null;
  provider: string | null;
  model: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

export interface RcaProviderInput {
  trace: {
    id: string;
    agentName: string;
    name: string | null;
    status: string;
    durationMs: string | null;
    errorType: string | null;
    errorMessage: string | null;
  };
  spans: RcaSpanContext[];
}

export interface RcaProvider {
  isConfigured(): boolean;
  analyze(input: RcaProviderInput): Promise<string>;
}
