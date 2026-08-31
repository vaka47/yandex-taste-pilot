import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { connectorRequest, type DeviceChallenge } from "@/lib/server/connector";
import { encryptSecret } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";
import { sameOrigin, inMemoryRateLimit } from "@/lib/server/security";
import { requireRole } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let admin;
  try { admin = await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  if (!inMemoryRateLimit(`service-connector:${admin.id}`, 3, 10 * 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  await ensureSchema();
  try {
    const challenge = await connectorRequest<DeviceChallenge>("/internal/yandex-music/device/start", { label: "Taste/playlist-service" });
    const expiresAt = new Date(Date.now() + challenge.expiresIn * 1000);
    const rows = await db()`
      insert into service_connection_challenges (
        encrypted_device_code, user_code, verification_url, poll_interval_seconds, expires_at, created_by
      ) values (
        ${encryptSecret(challenge.deviceCode)}, ${challenge.userCode}, ${challenge.verificationUrl},
        ${Math.max(5, challenge.interval)}, ${expiresAt}, ${admin.id}
      ) returning id
    `;
    await db()`
      insert into service_music_connections (singleton_id, status) values (1, 'pending')
      on conflict (singleton_id) do update set status = 'pending', last_error_at = null, last_error_code = null, updated_at = now()
    `;
    await audit(admin.id, "service_connector_device_flow_started", "service_music_connection", "1", { challengeId: rows[0].id });
    return NextResponse.json({
      id: rows[0].id,
      userCode: challenge.userCode,
      verificationUrl: challenge.verificationUrl,
      expiresAt: expiresAt.toISOString(),
      interval: Math.max(5, challenge.interval)
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CONNECTOR_START_FAILED" }, { status: 502 });
  }
}
