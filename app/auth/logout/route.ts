import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}

