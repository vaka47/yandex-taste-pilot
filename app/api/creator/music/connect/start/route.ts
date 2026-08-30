import { NextRequest, NextResponse } from "next/server";
import { connectorRequest, type DeviceChallenge } from "@/lib/server/connector";
import { encryptSecret } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";
import { sameOrigin, inMemoryRateLimit } from "@/lib/server/security";
import { audit } from "@/lib/server/audit";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  if (!inMemoryRateLimit(`connector:${creator.id}`, 3, 10 * 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  await ensureSchema();
  const makers = creator.role === "admin" ? await db()`select id from tastemakers where status <> 'archived' order by (owner_user_id = ${creator.id}) desc, created_at desc limit 1` : await db()`select id from tastemakers where owner_user_id = ${creator.id} limit 1`;
  const tastemakerId = makers[0]?.id as string | undefined;
  if (!tastemakerId) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  try {
    const challenge = await connectorRequest<DeviceChallenge>("/internal/yandex-music/device/start", { label: `Taste/${tastemakerId}` });
    const expiresAt = new Date(Date.now() + challenge.expiresIn * 1000);
    const rows = await db()`insert into connection_challenges (tastemaker_id, encrypted_device_code, user_code, verification_url, poll_interval_seconds, expires_at) values (${tastemakerId}, ${encryptSecret(challenge.deviceCode)}, ${challenge.userCode}, ${challenge.verificationUrl}, ${Math.max(5, challenge.interval)}, ${expiresAt}) returning id`;
    await db()`insert into music_connections (tastemaker_id, status) values (${tastemakerId}, 'pending') on conflict (tastemaker_id) do update set status = 'pending', updated_at = now()`;
    await audit(creator.id, "connector_device_flow_started", "tastemaker", tastemakerId, { challengeId: rows[0].id });
    return NextResponse.json({ id: rows[0].id, userCode: challenge.userCode, verificationUrl: challenge.verificationUrl, expiresAt: expiresAt.toISOString(), interval: Math.max(5, challenge.interval) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CONNECTOR_START_FAILED" }, { status: 502 });
  }
}
