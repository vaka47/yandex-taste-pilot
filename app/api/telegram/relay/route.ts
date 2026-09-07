import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const allowedMethods = new Set(["sendMessage", "setWebhook", "getWebhookInfo"]);

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, description: "UNAUTHORIZED" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, description: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000) {
    return NextResponse.json({ ok: false, description: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const input = await request.json().catch(() => null) as { method?: unknown; payload?: unknown } | null;
  const method = typeof input?.method === "string" ? input.method : "";
  const payload = input?.payload;
  if (!allowedMethods.has(method) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, description: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    const result = await upstream.json().catch(() => ({ ok: false, description: "TELEGRAM_INVALID_RESPONSE" }));
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, description: error instanceof Error ? error.message : "TELEGRAM_RELAY_FAILED" },
      { status: 502 }
    );
  }
}
