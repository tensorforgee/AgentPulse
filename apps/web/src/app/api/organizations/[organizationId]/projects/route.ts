import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { organizationId } = await context.params;
  return authenticatedProxy(
    request,
    `/organizations/${encodeURIComponent(organizationId)}/projects`,
    { method: "GET" },
  );
}

export async function POST(request: NextRequest, context: Context) {
  const { organizationId } = await context.params;
  return authenticatedProxy(
    request,
    `/organizations/${encodeURIComponent(organizationId)}/projects`,
    { method: "POST", body: await request.text() },
  );
}
