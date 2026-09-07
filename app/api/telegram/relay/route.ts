import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const maxDuration = 30;

const allowedMethods = new Set(["sendMessage", "setWebhook", "getWebhookInfo"]);

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, description: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000) {
    return NextResponse.json({ ok: false, description: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const body = await request.text();
  if (body.length > 64_000) {
    return NextResponse.json({ ok: false, description: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  const supplied = request.headers.get("x-taste-relay-signature") || "";
  const expected = createHmac("sha256", token).update(body).digest("hex");
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ ok: false, description: "UNAUTHORIZED" }, { status: 401 });
  }

  const input = (() => {
    try { return JSON.parse(body) as { method?: unknown; payload?: unknown }; }
    catch { return null; }
  })();
  const method = typeof input?.method === "string" ? input.method : "";
  const payload = input?.payload;
  if (!allowedMethods.has(method) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, description: "INVALID_REQUEST" }, { status: 400 });
  }

  const upstreamPayload = method === "setWebhook"
    ? { ...payload, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET }
    : payload;
  if (method === "setWebhook" && !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, description: "WEBHOOK_SECRET_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const upstream = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(upstreamPayload),
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
