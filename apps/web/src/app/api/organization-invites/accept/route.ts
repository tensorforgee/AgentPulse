import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

export async function POST(request: NextRequest) {
  return authenticatedProxy(request, "/organization-invites/accept", {
    method: "POST",
    body: await request.text(),
  });
}
