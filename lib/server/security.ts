import "server-only";
import { NextRequest } from "next/server";
import { appUrl } from "@/lib/server/config";

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(appUrl()).origin || new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function inMemoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

