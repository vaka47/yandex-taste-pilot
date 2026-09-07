import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { claimTelegramUpdate, handleTelegramUpdate, notifyTelegramUpdateError, type TelegramUpdate } from "@/lib/server/telegram";

export const maxDuration = 30;

function signaturesMatch(supplied: string, expected: string) {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-telegram-bot-api-secret-token");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const body = await request.text();
  const relaySignature = request.headers.get("x-taste-relay-signature") || "";
  const expectedRelaySignature = token ? createHmac("sha256", token).update(body).digest("hex") : "";
  const relayed = Boolean(token && relaySignature && signaturesMatch(relaySignature, expectedRelaySignature));
  if (!relayed && (!expected || supplied !== expected)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Telegram cannot establish a stable connection to the Yandex Cloud VM from
  // every edge. Vercel receives the official webhook and forwards the exact,
  // authenticated payload to the production app, which owns the live database.
  if (process.env.VERCEL === "1" && !relayed) {
    if (!token) return NextResponse.json({ error: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });
    const forwardUrl = process.env.TELEGRAM_WEBHOOK_FORWARD_URL?.trim() || "https://nitca.ru/api/telegram/webhook";
    try {
      const upstream = await fetch(forwardUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-taste-relay-signature": expectedRelaySignature
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000)
      });
      const result = await upstream.json().catch(() => ({ error: "INVALID_FORWARD_RESPONSE" }));
      return NextResponse.json(result, { status: upstream.status });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "TELEGRAM_FORWARD_FAILED" },
        { status: 502 }
      );
    }
  }

  const update = (() => {
    try { return JSON.parse(body) as TelegramUpdate; }
    catch { return null; }
  })();
  if (!update || typeof update.update_id !== "number") return NextResponse.json({ error: "INVALID_UPDATE" }, { status: 400 });
  if (!(await claimTelegramUpdate(update.update_id))) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    await notifyTelegramUpdateError(update, error);
  }
  return NextResponse.json({ ok: true });
}
