import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/backend";

export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);
  const isProtected = request.nextUrl.pathname.startsWith("/app");
  const isAuthPage = ["/login", "/signup"].includes(request.nextUrl.pathname);

  if (isProtected && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup"],
};
