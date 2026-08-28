import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

type Context =
  RouteContext<"/api/organizations/[organizationId]/[...resource]">;

export function GET(request: NextRequest, context: Context) {
  return proxy(request, context, "GET");
}

export function POST(request: NextRequest, context: Context) {
  return proxy(request, context, "POST");
}

export function PATCH(request: NextRequest, context: Context) {
  return proxy(request, context, "PATCH");
}

export function DELETE(request: NextRequest, context: Context) {
  return proxy(request, context, "DELETE");
}

async function proxy(
  request: NextRequest,
  context: Context,
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  const { organizationId, resource } = await context.params;
  const suffix = resource.map(encodeURIComponent).join("/");
  const hasBody = method === "POST" || method === "PATCH";
  return authenticatedProxy(
    request,
    `/organizations/${encodeURIComponent(organizationId)}/${suffix}`,
    {
      method,
      ...(hasBody ? { body: await request.text() } : {}),
    },
  );
}
