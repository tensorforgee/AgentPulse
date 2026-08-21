import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

type Context = {
  params: Promise<{ projectId: string; apiKeyId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const { projectId, apiKeyId } = await context.params;
  return authenticatedProxy(
    request,
    `/projects/${encodeURIComponent(projectId)}/api-keys/${encodeURIComponent(apiKeyId)}/revoke`,
    { method: "POST" },
  );
}
