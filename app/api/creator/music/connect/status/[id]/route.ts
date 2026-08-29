import { NextResponse } from "next/server";
import { connectorRequest, type DevicePoll } from "@/lib/server/connector";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const { id } = await params;
  await ensureSchema();
  const rows = await db()`
    select cc.*, t.owner_user_id from connection_challenges cc join tastemakers t on t.id = cc.tastemaker_id
    where cc.id = ${id} and cc.completed_at is null limit 1
  `;
  const challenge = rows[0];
  if (!challenge || (creator.role !== "admin" && challenge.owner_user_id !== creator.id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (new Date(challenge.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "DEVICE_FLOW_EXPIRED" }, { status: 410 });
  try {
    const result = await connectorRequest<DevicePoll>("/internal/yandex-music/device/poll", { deviceCode: decryptSecret(challenge.encrypted_device_code) });
    if (result.status === "pending") return NextResponse.json({ status: "pending" }, { status: 202 });
    if (!result.accessToken) throw new Error("CONNECTOR_TOKEN_MISSING");
    const expiresAt = result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null;
    await db().begin(async sql => {
      await sql`update connection_challenges set completed_at = now() where id = ${id}`;
      await sql`
        update music_connections set provider_account_id = ${result.account?.id || null}, provider_login = ${result.account?.login || null},
          encrypted_access_token = ${encryptSecret(result.accessToken!)}, encrypted_refresh_token = ${result.refreshToken ? encryptSecret(result.refreshToken) : null},
          token_expires_at = ${expiresAt}, status = 'connected', connected_at = coalesce(connected_at, now()), last_success_at = now(), last_error_at = null, last_error_code = null, updated_at = now()
        where tastemaker_id = ${challenge.tastemaker_id}
      `;
      await sql`update tastemakers set status = 'active', is_public = true, publish_enabled = true, consent_version = 'pilot-1.0', consent_at = coalesce(consent_at, now()), updated_at = now() where id = ${challenge.tastemaker_id}`;
      await sql`insert into sync_logs (tastemaker_id, job_type, status, stats) values (${challenge.tastemaker_id}, 'first_history_sync', 'queued', '{}'::jsonb)`;
    });
    await audit(creator.id, "connector_connected", "tastemaker", challenge.tastemaker_id, { providerAccountId: result.account?.id || null });
    return NextResponse.json({ status: "connected", account: result.account || null });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN_PROVIDER_ERROR";
    await db()`update music_connections set status = 'error', last_error_at = now(), last_error_code = ${code}, updated_at = now() where tastemaker_id = ${challenge.tastemaker_id}`;
    return NextResponse.json({ error: code }, { status: 502 });
  }
}

