import { Injectable, type LoggerService } from '@nestjs/common';

export type OperationalLogLevel = 'debug' | 'error' | 'info' | 'warn';

const SENSITIVE_FIELD =
  /(password|authorization|cookie|token|secret|api.?key|hashed.?key|webhook)/i;
const API_KEY_VALUE = /ap_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}/g;
const BEARER_VALUE = /Bearer\s+[^\s"']+/gi;
const JWT_VALUE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const DATABASE_CREDENTIALS = /\b(postgresql|postgres|mysql):\/\/[^@\s]+@/gi;
const MAX_SANITIZE_DEPTH = 5;

function sanitizeText(value: string): string {
  return value
    .replace(API_KEY_VALUE, '[REDACTED_API_KEY]')
    .replace(BEARER_VALUE, 'Bearer [REDACTED]')
    .replace(JWT_VALUE, '[REDACTED_JWT]')
    .replace(DATABASE_CREDENTIALS, '$1://[REDACTED]@');
}

function sanitizeValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Error) {
    return { name: value.name };
  }
  if (typeof value !== 'object') {
    return typeof value === 'symbol'
      ? (value.description ?? 'Symbol')
      : `[${typeof value}]`;
  }
  if (depth >= MAX_SANITIZE_DEPTH || seen.has(value)) {
    return '[TRUNCATED]';
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_FIELD.test(key)
      ? '[REDACTED]'
      : sanitizeValue(item, seen, depth + 1);
  }
  return result;
}

@Injectable()
export class JsonLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  logEvent(
    level: OperationalLogLevel,
    event: string,
    fields: Record<string, unknown> = {},
  ): void {
    const sanitizedFields = sanitizeValue(fields) as Record<string, unknown>;
    this.output({
      ...sanitizedFields,
      timestamp: new Date().toISOString(),
      level,
      service: 'agentpulse-api',
      event,
    });
  }

  private write(
    level: OperationalLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const possibleContext = optionalParams.at(-1);
    this.output({
      timestamp: new Date().toISOString(),
      level,
      service: 'agentpulse-api',
      ...(typeof possibleContext === 'string'
        ? { context: sanitizeText(possibleContext) }
        : {}),
      message: sanitizeValue(message),
    });
  }

  private output(entry: Record<string, unknown>): void {
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'agentpulse-api',
        event: 'logger.serialization_failed',
      });
    }

    const destination =
      entry.level === 'error' || entry.level === 'warn'
        ? process.stderr
        : process.stdout;
    destination.write(`${line}\n`);
  }
}
