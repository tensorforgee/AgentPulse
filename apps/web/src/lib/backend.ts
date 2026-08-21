import { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "agentpulse_access";
export const REFRESH_COOKIE = "agentpulse_refresh";

const API_URL = (
  process.env.AGENTPULSE_API_URL ?? "http://127.0.0.1:5000"
).replace(/\/$/, "");

interface AuthPayload {
  user?: unknown;
  accessToken: string;
  refreshToken: string;
}

const refreshRequests = new Map<string, Promise<AuthPayload | undefined>>();

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function setSessionCookies(response: NextResponse, auth: AuthPayload) {
  response.cookies.set(ACCESS_COOKIE, auth.accessToken, cookieOptions(15 * 60));
  response.cookies.set(
    REFRESH_COOKIE,
    auth.refreshToken,
    cookieOptions(7 * 24 * 60 * 60),
  );
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
}

async function callApi(path: string, init: RequestInit, accessToken?: string) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function responseFromApi(upstream: Response) {
  const body = await upstream.text();
  return new NextResponse(body || null, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

function isAuthPayload(value: unknown): value is AuthPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthPayload>;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string"
  );
}

function refreshSession(refreshToken: string) {
  const existing = refreshRequests.get(refreshToken);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const response = await callApi("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return undefined;

      const payload: unknown = await response.json();
      return isAuthPayload(payload) ? payload : undefined;
    } finally {
      refreshRequests.delete(refreshToken);
    }
  })();

  refreshRequests.set(refreshToken, pending);
  return pending;
}

export async function handleAuth(request: NextRequest, path: string) {
  const upstream = await callApi(path, {
    method: "POST",
    body: await request.text(),
  });

  if (!upstream.ok) return responseFromApi(upstream);

  const payload: unknown = await upstream.json();
  if (!isAuthPayload(payload) || !payload.user) {
    return NextResponse.json(
      { message: "Authentication service returned an invalid response" },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ user: payload.user });
  setSessionCookies(response, payload);
  return response;
}

export async function authenticatedProxy(
  request: NextRequest,
  path: string,
  init: RequestInit,
) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let upstream = await callApi(path, init, accessToken);
  let refreshed: AuthPayload | undefined;

  if (upstream.status === 401) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      refreshed = await refreshSession(refreshToken);
      if (refreshed) {
        upstream = await callApi(path, init, refreshed.accessToken);
      }
    }
  }

  const response = await responseFromApi(upstream);
  if (refreshed) setSessionCookies(response, refreshed);
  else if (upstream.status === 401) clearSessionCookies(response);

  return response;
}

export async function authenticatedStreamProxy(
  request: NextRequest,
  path: string,
) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let upstream = await callApi(path, { method: "GET" }, accessToken);
  let refreshed: AuthPayload | undefined;

  if (upstream.status === 401) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      refreshed = await refreshSession(refreshToken);
      if (refreshed) {
        upstream = await callApi(
          path,
          { method: "GET" },
          refreshed.accessToken,
        );
      }
    }
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type":
        upstream.headers.get("content-type") ?? "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
  if (refreshed) setSessionCookies(response, refreshed);
  else if (upstream.status === 401) clearSessionCookies(response);

  return response;
}

export async function handleLogout(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await callApi("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Local logout must still succeed if the API is temporarily unavailable.
    }
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
