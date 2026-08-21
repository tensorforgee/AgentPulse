import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

type Context = { params: Promise<{ traceId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { traceId } = await context.params;
  return authenticatedProxy(
    request,
    `/traces/${encodeURIComponent(traceId)}/rca`,
    { method: "POST" },
  );
}
