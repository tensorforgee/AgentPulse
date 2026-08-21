import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  loadConfigFromEnvironment,
  runLoadTest,
  type LoadCredentials,
} from './load-test-core';

interface AuthResponse {
  accessToken: string;
}

interface IdResponse {
  id: string;
}

interface ApiKeyResponse {
  key: string;
}

async function main(): Promise<void> {
  const configuredBaseUrl = new URL(
    process.env.LOAD_BASE_URL ?? 'http://localhost:5000',
  );
  if (
    !['http:', 'https:'].includes(configuredBaseUrl.protocol) ||
    configuredBaseUrl.username ||
    configuredBaseUrl.password ||
    configuredBaseUrl.pathname !== '/' ||
    configuredBaseUrl.search ||
    configuredBaseUrl.hash
  ) {
    throw new Error('LOAD_BASE_URL must be an HTTP or HTTPS origin');
  }
  const baseUrl = configuredBaseUrl.origin;
  const suffix = randomUUID();
  const email = `load-${suffix}@example.com`;
  const organizationSlug = `load-${suffix}`;
  const password = `${randomBytes(24).toString('base64url')}Aa1!`;
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const auth = await jsonRequest<AuthResponse>(baseUrl, '/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'content-type': 'application/json' },
    });
    const organization = await jsonRequest<IdResponse>(
      baseUrl,
      '/organizations',
      authenticatedRequest(auth.accessToken, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Load Test Organization',
          slug: organizationSlug,
        }),
      }),
    );
    const project = await jsonRequest<IdResponse>(
      baseUrl,
      `/organizations/${organization.id}/projects`,
      authenticatedRequest(auth.accessToken, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Load Test Project',
          slug: 'load-test-project',
        }),
      }),
    );
    const apiKey = await jsonRequest<ApiKeyResponse>(
      baseUrl,
      `/projects/${project.id}/api-keys`,
      authenticatedRequest(auth.accessToken, {
        method: 'POST',
        body: JSON.stringify({ name: 'Load test key' }),
      }),
    );

    const credentials: LoadCredentials = {
      accessToken: auth.accessToken,
      apiKey: apiKey.key,
      projectId: project.id,
    };
    const report = await runLoadTest(loadConfigFromEnvironment(credentials));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    try {
      await delay(
        integerEnvironment('LOAD_CLEANUP_DELAY_MS', 3_000, 0, 120_000),
      );
      await prisma.organization.deleteMany({
        where: { slug: organizationSlug },
      });
      await prisma.user.deleteMany({ where: { email } });
    } finally {
      await prisma.onModuleDestroy();
    }
  }
}

function authenticatedRequest(
  accessToken: string,
  init: RequestInit,
): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  };
}

async function jsonRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(
      `Load-test setup failed for ${path} with HTTP ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown load error';
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
