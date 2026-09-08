import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/security";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
