import type { NextRequest } from "next/server";
import { authenticatedStreamProxy } from "@/lib/backend";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  return authenticatedStreamProxy(
    request,
    `/projects/${encodeURIComponent(projectId)}/events`,
  );
}
