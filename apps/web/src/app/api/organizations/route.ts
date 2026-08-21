import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

export function GET(request: NextRequest) {
  return authenticatedProxy(request, "/organizations", { method: "GET" });
}

export async function POST(request: NextRequest) {
  return authenticatedProxy(request, "/organizations", {
    method: "POST",
    body: await request.text(),
  });
}
