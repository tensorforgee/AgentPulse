import type { NextRequest } from "next/server";
import { handleAuth } from "@/lib/backend";

export function POST(request: NextRequest) {
  return handleAuth(request, "/auth/login");
}
