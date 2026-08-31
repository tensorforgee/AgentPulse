import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const LOCAL_ENVIRONMENTS = new Set(['development', 'test']);
const METADATA_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
]);

export type OutboundHostnameResolver = (
  hostname: string,
) => Promise<readonly { address: string }[]>;

export function corsOrigins(
  configuredValue: string | undefined,
  environment: string | undefined,
): string[] {
  const configured = configuredValue
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configured?.length) {
    if (environment === 'production') {
      throw new Error('CORS_ORIGINS is required in production');
    }
    return ['http://localhost:3000'];
  }

  return configured.map((origin) => {
    try {
      const parsed = new URL(origin);
      const allowedProtocol =
        parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && environment !== 'production');

      if (!allowedProtocol || parsed.origin !== origin) {
        throw new Error();
      }
      return origin;
    } catch {
      throw new Error(
        'CORS_ORIGINS must contain exact HTTP(S) origins and use HTTPS in production',
      );
    }
  });
}

export function isAllowedOutboundUrl(
  url: URL,
  environment = process.env.NODE_ENV,
): boolean {
  if (url.username || url.password) {
    return false;
  }
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOCAL_ENVIRONMENTS.has(environment ?? ''))
  );
}

export async function validateTenantWebhookUrl(
  value: string,
  environment = process.env.NODE_ENV,
  resolver: OutboundHostnameResolver = resolveHostname,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Webhook URL must be a valid URL');
  }

  if (url.username || url.password) {
    throw new Error('Webhook URL must not include embedded credentials');
  }
  const isLocalEnvironment = LOCAL_ENVIRONMENTS.has(environment ?? '');
  if (
    url.protocol !== 'https:' &&
    !(isLocalEnvironment && url.protocol === 'http:')
  ) {
    throw new Error(
      isLocalEnvironment
        ? 'Webhook URL must use HTTP or HTTPS'
        : 'Webhook URL must use HTTPS in production',
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (METADATA_HOSTNAMES.has(hostname)) {
    throw new Error('Webhook URL target is not allowed');
  }

  const literalVersion = isIP(hostname);
  if (
    !isLocalEnvironment &&
    (hostname === 'localhost' || hostname.endsWith('.localhost'))
  ) {
    throw new Error('Webhook URL target is not allowed');
  }
  if (!isLocalEnvironment && literalVersion && !isPublicAddress(hostname)) {
    throw new Error('Webhook URL target is not allowed');
  }

  if (!isLocalEnvironment && literalVersion === 0) {
    let addresses: readonly { address: string }[];
    try {
      addresses = await resolver(hostname);
    } catch {
      throw new Error('Webhook URL hostname could not be resolved');
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new Error('Webhook URL target is not allowed');
    }
  }

  return url;
}

async function resolveHostname(
  hostname: string,
): Promise<readonly { address: string }[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function isPublicAddress(address: string): boolean {
  const normalized = normalizeHostname(address).split('%', 1)[0];
  const version = isIP(normalized);
  if (version === 4) {
    return isPublicIpv4(normalized);
  }
  if (version === 6) {
    return isPublicIpv6(normalized);
  }
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [first, second, third, fourth] = octets;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  ) {
    return false;
  }
  return !(first === 100 && second === 100 && third === 100 && fourth === 200);
}

function isPublicIpv6(address: string): boolean {
  const words = ipv6Words(address);
  if (!words) {
    return false;
  }
  const allZero = words.every((word) => word === 0);
  const loopback =
    words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const uniqueLocal = (words[0] & 0xfe00) === 0xfc00;
  const linkLocal = (words[0] & 0xffc0) === 0xfe80;
  const multicast = (words[0] & 0xff00) === 0xff00;
  const ipv4Mapped =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Mapped) {
    const mapped = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isPublicIpv4(mapped);
  }
  return !allZero && !loopback && !uniqueLocal && !linkLocal && !multicast;
}

function ipv6Words(address: string): number[] | null {
  const halves = address.split('::');
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    return null;
  }
  const parts = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ];
  const words = parts.map((part) => Number.parseInt(part || '0', 16));
  return words.length === 8 &&
    words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)
    ? words
    : null;
}
