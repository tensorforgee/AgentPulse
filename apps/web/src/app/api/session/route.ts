import type { NextRequest } from "next/server";
import { authenticatedProxy } from "@/lib/backend";

export function GET(request: NextRequest) {
  return authenticatedProxy(request, "/me", { method: "GET" });
}
