import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { connectorRequest, type DevicePoll } from "@/lib/server/connector";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const { id } = await params;
  await ensureSchema();
  const rows = await db()`select * from service_connection_challenges where id = ${id} and completed_at is null limit 1`;
  const challenge = rows[0];
  if (!challenge) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (new Date(challenge.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "DEVICE_FLOW_EXPIRED" }, { status: 410 });
  try {
    const result = await connectorRequest<DevicePoll>("/internal/yandex-music/device/poll", { deviceCode: decryptSecret(challenge.encrypted_device_code) });
    if (result.status === "pending") return NextResponse.json({ status: "pending" }, { status: 202 });
    if (!result.accessToken) throw new Error("CONNECTOR_TOKEN_MISSING");
    const expiresAt = result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null;
    await db().begin(async sql => {
      await sql`update service_connection_challenges set completed_at = now() where id = ${id}`;
      await sql`
        insert into service_music_connections (
          singleton_id, provider_account_id, provider_login, encrypted_access_token, encrypted_refresh_token,
          token_expires_at, status, connected_at, last_error_at, last_error_code
        ) values (
          1, ${result.account?.id || null}, ${result.account?.login || null}, ${encryptSecret(result.accessToken!)},
          ${result.refreshToken ? encryptSecret(result.refreshToken) : null}, ${expiresAt}, 'connected', now(), null, null
        ) on conflict (singleton_id) do update set
          provider_account_id = excluded.provider_account_id, provider_login = excluded.provider_login,
          encrypted_access_token = excluded.encrypted_access_token, encrypted_refresh_token = excluded.encrypted_refresh_token,
          token_expires_at = excluded.token_expires_at, status = 'connected',
          connected_at = coalesce(service_music_connections.connected_at, now()), last_error_at = null,
          last_error_code = null, updated_at = now()
      `;
    });
    await audit(admin.id, "service_connector_connected", "service_music_connection", "1", { providerAccountId: result.account?.id || null });
    return NextResponse.json({ status: "connected", account: result.account || null });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN_PROVIDER_ERROR";
    await db()`update service_music_connections set status = 'error', last_error_at = now(), last_error_code = ${code}, updated_at = now() where singleton_id = 1`;
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
