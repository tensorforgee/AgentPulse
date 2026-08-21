import { JsonLoggerService } from './json-logger.service';

describe('JsonLoggerService', () => {
  let stdoutLine: string;
  let stderrLine: string;
  let logger: JsonLoggerService;

  beforeEach(() => {
    stdoutLine = '';
    stderrLine = '';
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLine += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLine += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
    logger = new JsonLoggerService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('emits structured JSON and redacts sensitive fields and values', () => {
    const apiKey = `ap_live_abcdefgh_${'a'.repeat(43)}`;
    const jwt = 'eyJheader.eyJpayload.signature';

    logger.logEvent('info', 'security.test', {
      requestId: 'request-1',
      password: 'not-for-logs',
      authorization: `Bearer ${jwt}`,
      message: `key=${apiKey}`,
    });

    expect(() => {
      JSON.parse(stdoutLine);
    }).not.toThrow();
    expect(stdoutLine).toContain('"event":"security.test"');
    expect(stdoutLine).toContain('"requestId":"request-1"');
    expect(stdoutLine).not.toContain('not-for-logs');
    expect(stdoutLine).not.toContain(apiKey);
    expect(stdoutLine).not.toContain(jwt);
  });

  it('sanitizes credentials in ordinary error logger messages', () => {
    logger.error(
      'connection postgresql://admin:private@database/agentpulse failed',
      'Database',
    );

    expect(stderrLine).toContain('postgresql://[REDACTED]@');
    expect(stderrLine).not.toContain('admin:private');
  });
});
