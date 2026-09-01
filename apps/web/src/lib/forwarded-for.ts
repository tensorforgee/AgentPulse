export interface ForwardedHeaderSource {
  get(name: string): string | null;
}

/**
 * Returns the inbound `x-forwarded-for` chain so the server-side call to the
 * API can replay it verbatim.
 *
 * Caddy discards client-supplied `X-Forwarded-*` values and sets the chain to
 * the real client address, so what this reads is already trustworthy. The API
 * runs with `TRUST_PROXY_HOPS=1` and reads the right-most entry, which keeps
 * browser -> Caddy -> web -> API requests resolving to the same client identity
 * as direct SDK -> Caddy -> API requests. Replaying the chain unchanged also
 * keeps that arithmetic correct if Caddy is later given `trusted_proxies`.
 */
export function forwardedForHeader(
  headers: ForwardedHeaderSource,
): string | null {
  const chain = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return chain?.length ? chain.join(", ") : null;
}
