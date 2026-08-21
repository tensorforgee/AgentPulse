import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  return authenticatedProxy(
    request,
    `/projects/${encodeURIComponent(projectId)}/traces/metrics`,
    { method: "GET" },
  );
}
