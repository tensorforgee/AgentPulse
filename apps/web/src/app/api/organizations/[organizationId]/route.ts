import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

export function GET(
  request: NextRequest,
  context: RouteContext<"/api/organizations/[organizationId]">,
) {
  return proxy(request, context, "GET");
}

export function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/organizations/[organizationId]">,
) {
  return proxy(request, context, "PATCH");
}

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/organizations/[organizationId]">,
  method: "GET" | "PATCH",
) {
  const { organizationId } = await context.params;
  return authenticatedProxy(
    request,
    `/organizations/${encodeURIComponent(organizationId)}`,
    {
      method,
      ...(method === "PATCH" ? { body: await request.text() } : {}),
    },
  );
}
