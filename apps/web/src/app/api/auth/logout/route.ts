import type { NextRequest } from "next/server";
import { handleLogout } from "@/lib/backend";

export function POST(request: NextRequest) {
  return handleLogout(request);
}
