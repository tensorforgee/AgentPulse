import { OpenAiRcaProvider } from './openai-rca.provider';

describe('OpenAiRcaProvider transport security', () => {
  const environment = new Map<string, string | undefined>();
  const names = [
    'NODE_ENV',
    'RCA_PROVIDER_API_KEY',
    'RCA_PROVIDER_MODEL',
    'RCA_PROVIDER_BASE_URL',
  ] as const;

  beforeEach(() => {
    for (const name of names) {
      environment.set(name, process.env[name]);
    }
    process.env.NODE_ENV = 'production';
    process.env.RCA_PROVIDER_API_KEY = 'test-provider-key';
    process.env.RCA_PROVIDER_MODEL = 'test-model';
    process.env.RCA_PROVIDER_BASE_URL = 'http://provider.example.com/v1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of names) {
      const value = environment.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    environment.clear();
  });

  it('rejects plaintext provider URLs before sending credentials', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const provider = new OpenAiRcaProvider();

    await expect(
      provider.analyze({
        trace: {
          id: 'trace-id',
          agentName: 'agent',
          name: null,
          status: 'failed',
          durationMs: null,
          errorType: 'Error',
          errorMessage: 'failed',
        },
        spans: [],
      }),
    ).rejects.toThrow('allowed secure URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
