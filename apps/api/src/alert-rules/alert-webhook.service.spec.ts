import { createHmac } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { AlertWebhookService } from './alert-webhook.service';

interface ProjectWebhookRecord {
  alertWebhookUrl: string | null;
  alertWebhookSecretEncrypted: string | null;
}

type UpdateProject = (input: {
  data: Partial<ProjectWebhookRecord>;
}) => Promise<ProjectWebhookRecord>;

type FindProject = (input: unknown) => Promise<ProjectWebhookRecord>;

describe('AlertWebhookService', () => {
  const projectId = '7cb34107-8c31-4c33-af45-c7e33c123fb0';
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    ALERT_WEBHOOK_ENCRYPTION_KEY: process.env.ALERT_WEBHOOK_ENCRYPTION_KEY,
    ALERT_WEBHOOK_URLS_JSON: process.env.ALERT_WEBHOOK_URLS_JSON,
  };
  let project: ProjectWebhookRecord;
  let update: jest.MockedFunction<UpdateProject>;
  let findUniqueOrThrow: jest.MockedFunction<FindProject>;
  let service: AlertWebhookService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ALERT_WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    delete process.env.ALERT_WEBHOOK_URLS_JSON;
    project = {
      alertWebhookUrl: null,
      alertWebhookSecretEncrypted: null,
    };
    update = jest.fn(({ data }) => {
      project = { ...project, ...data };
      return Promise.resolve(project);
    });
    findUniqueOrThrow = jest.fn(() => Promise.resolve(project));
    service = new AlertWebhookService({
      project: { update, findUniqueOrThrow },
    } as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnvironment(originalEnvironment);
  });

  it('shows a generated signing secret once and stores only authenticated ciphertext', async () => {
    const configured = await service.configure(
      projectId,
      'http://mock.local/agentpulse',
    );

    expect(configured).toMatchObject({
      url: 'http://mock.local/agentpulse',
      signatureVersion: 'v1',
    });
    expect(configured.signingSecret).toMatch(/^whsec_[A-Za-z0-9_-]+$/);
    expect(project.alertWebhookSecretEncrypted).toMatch(/^v1\./);
    expect(project.alertWebhookSecretEncrypted).not.toContain(
      configured.signingSecret,
    );

    const status = await service.status(projectId);
    expect(status).toEqual({
      configured: true,
      url: 'http://mock.local/agentpulse',
      source: 'project',
      signed: true,
    });
    expect(status).not.toHaveProperty('signingSecret');
  });

  it('signs the exact request body with timestamped HMAC headers', async () => {
    const configured = await service.configure(
      projectId,
      'http://mock.local/agentpulse',
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      service.deliver(projectId, { event: 'alert.triggered', value: 2 }),
    ).resolves.toMatchObject({ status: 'delivered', error: null });

    const request = fetchMock.mock.calls[0][1];
    const body = stringBody(request?.body);
    const headers = request?.headers as Record<string, string>;
    const timestamp = headers['x-agentpulse-timestamp'];
    const expected = createHmac('sha256', configured.signingSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    expect(headers['x-agentpulse-signature']).toBe(`v1=${expected}`);
    expect(JSON.parse(body)).toEqual({
      event: 'alert.triggered',
      value: 2,
    });
  });

  it('uses the legacy environment mapping only as an unsigned fallback', async () => {
    process.env.ALERT_WEBHOOK_URLS_JSON = JSON.stringify({
      [projectId]: 'http://legacy.mock/agentpulse',
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(service.test(projectId)).resolves.toMatchObject({
      status: 'delivered',
    });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers).not.toHaveProperty('x-agentpulse-signature');
    expect(
      JSON.parse(stringBody(fetchMock.mock.calls[0][1]?.body)),
    ).toMatchObject({
      agentpulse: { type: 'webhook.test', projectId },
    });
  });

  it('returns only sanitized request failure diagnostics', async () => {
    await service.configure(projectId, 'http://mock.local/secret-path');
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('http://mock.local/secret-path failed'));

    await expect(service.test(projectId)).resolves.toMatchObject({
      status: 'failed',
      error: 'Request failed',
    });
  });
});

function stringBody(value: BodyInit | null | undefined): string {
  if (typeof value !== 'string') {
    throw new Error('Expected a string request body');
  }
  return value;
}

function restoreEnvironment(values: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
