import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { validateTenantWebhookUrl } from '../operations/security-config';
import { PrismaService } from '../prisma/prisma.service';

const WEBHOOK_TIMEOUT_MS = 3_000;
const ENCRYPTED_SECRET_VERSION = 'v1';
const SIGNATURE_VERSION = 'v1';

interface WebhookConfiguration {
  url: string | null;
  signingSecret: string | null;
  source: 'project' | 'environment' | null;
  error: string | null;
}

export interface WebhookDeliveryResult {
  readonly status: 'delivered' | 'failed' | 'not_configured';
  readonly attemptedAt: Date | null;
  readonly error: string | null;
}

@Injectable()
export class AlertWebhookService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    assertAlertWebhookEncryptionKey();
  }

  async configure(projectId: string, value: string) {
    const url = await this.validatedUrl(value);
    const signingSecret = `whsec_${randomBytes(32).toString('base64url')}`;
    const encryptedSecret = encryptSecret(signingSecret, encryptionKey());

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        alertWebhookUrl: url.toString(),
        alertWebhookSecretEncrypted: encryptedSecret,
      },
    });

    return {
      url: url.toString(),
      signingSecret,
      signatureVersion: SIGNATURE_VERSION,
    };
  }

  async status(projectId: string) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { alertWebhookUrl: true },
    });
    if (project.alertWebhookUrl) {
      return {
        configured: true,
        url: project.alertWebhookUrl,
        source: 'project' as const,
        signed: true,
      };
    }

    const fallback = legacyConfiguration(projectId);
    return {
      configured: Boolean(fallback.url),
      url: fallback.url,
      source: fallback.url ? ('environment' as const) : null,
      signed: false,
      configurationError: fallback.error,
    };
  }

  async remove(projectId: string): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        alertWebhookUrl: null,
        alertWebhookSecretEncrypted: null,
      },
    });
  }

  async test(projectId: string): Promise<WebhookDeliveryResult> {
    const sentAt = new Date().toISOString();
    return this.deliver(projectId, {
      text: '[AgentPulse] Test webhook delivery',
      agentpulse: {
        type: 'webhook.test',
        projectId,
        sentAt,
      },
    });
  }

  async deliver(
    projectId: string,
    payload: unknown,
  ): Promise<WebhookDeliveryResult> {
    let configuration: WebhookConfiguration;
    try {
      configuration = await this.configuration(projectId);
    } catch {
      return {
        status: 'failed',
        attemptedAt: null,
        error: 'Webhook configuration is unavailable',
      };
    }
    if (!configuration.url) {
      return {
        status: 'not_configured',
        attemptedAt: null,
        error: configuration.error,
      };
    }

    let url: URL;
    try {
      url = await this.validatedUrl(configuration.url);
    } catch {
      return {
        status: 'failed',
        attemptedAt: null,
        error: 'Webhook URL is not allowed',
      };
    }

    const body = JSON.stringify(payload);
    const attemptedAt = new Date();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (configuration.signingSecret) {
      const timestamp = Math.floor(attemptedAt.getTime() / 1000).toString();
      headers['x-agentpulse-timestamp'] = timestamp;
      headers['x-agentpulse-signature'] = `${SIGNATURE_VERSION}=${createHmac(
        'sha256',
        configuration.signingSecret,
      )
        .update(`${timestamp}.${body}`)
        .digest('hex')}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          status: 'failed',
          attemptedAt,
          error: `HTTP ${response.status}`,
        };
      }
      return { status: 'delivered', attemptedAt, error: null };
    } catch {
      return { status: 'failed', attemptedAt, error: 'Request failed' };
    }
  }

  private async configuration(
    projectId: string,
  ): Promise<WebhookConfiguration> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        alertWebhookUrl: true,
        alertWebhookSecretEncrypted: true,
      },
    });
    if (project.alertWebhookUrl && project.alertWebhookSecretEncrypted) {
      return {
        url: project.alertWebhookUrl,
        signingSecret: decryptSecret(
          project.alertWebhookSecretEncrypted,
          encryptionKey(),
        ),
        source: 'project',
        error: null,
      };
    }
    if (project.alertWebhookUrl || project.alertWebhookSecretEncrypted) {
      return {
        url: null,
        signingSecret: null,
        source: 'project',
        error: 'Project webhook configuration is incomplete',
      };
    }
    return legacyConfiguration(projectId);
  }

  private async validatedUrl(value: string): Promise<URL> {
    try {
      return await validateTenantWebhookUrl(value);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Webhook URL is not allowed',
      );
    }
  }
}

function legacyConfiguration(projectId: string): WebhookConfiguration {
  const configured = process.env.ALERT_WEBHOOK_URLS_JSON;
  if (!configured) {
    return { url: null, signingSecret: null, source: null, error: null };
  }
  try {
    const mapping = JSON.parse(configured) as unknown;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      return {
        url: null,
        signingSecret: null,
        source: 'environment',
        error: 'ALERT_WEBHOOK_URLS_JSON must be a JSON object',
      };
    }
    const value = (mapping as Record<string, unknown>)[projectId];
    if (value === undefined) {
      return { url: null, signingSecret: null, source: null, error: null };
    }
    if (typeof value !== 'string') {
      return {
        url: null,
        signingSecret: null,
        source: 'environment',
        error: 'Project webhook URL must be a string',
      };
    }
    return {
      url: value,
      signingSecret: null,
      source: 'environment',
      error: null,
    };
  } catch {
    return {
      url: null,
      signingSecret: null,
      source: 'environment',
      error: 'ALERT_WEBHOOK_URLS_JSON contains invalid JSON',
    };
  }
}

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'ALERT_WEBHOOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }
  return key;
}

/**
 * Fails startup on a malformed key instead of waiting for the first webhook
 * call to return 503. An unset key stays a runtime condition so local
 * development and deployments that never configure webhooks still boot.
 */
export function assertAlertWebhookEncryptionKey(
  value = process.env.ALERT_WEBHOOK_ENCRYPTION_KEY,
): void {
  if (value === undefined || value.trim() === '') {
    return;
  }
  decodeEncryptionKey(value);
}

function encryptionKey(): Buffer {
  const value = process.env.ALERT_WEBHOOK_ENCRYPTION_KEY;
  if (!value) {
    throw new ServiceUnavailableException(
      'Tenant webhook encryption is not configured',
    );
  }
  try {
    return decodeEncryptionKey(value);
  } catch {
    throw new ServiceUnavailableException(
      'Tenant webhook encryption key must decode to 32 bytes',
    );
  }
}

function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    ENCRYPTED_SECRET_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decryptSecret(value: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== ENCRYPTED_SECRET_VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported encrypted webhook secret');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
