import { NextResponse } from "next/server";
import { getAutomationState } from "@/lib/server/automation";
import { featureFlag, hasSingleAdminConfigured, isConnectorConfigured, isDatabaseConfigured, isOwnerLoginConfigured, isYandexIdConfigured, telegramNotificationsConfigured } from "@/lib/server/config";
import { db, ensureSchema } from "@/lib/server/db";
import { connectorHealth } from "@/lib/server/connector";

export async function GET() {
  const database = isDatabaseConfigured();
  const [connectorOnline, automation, liveState] = await Promise.all([
    connectorHealth(),
    database ? getAutomationState().catch(() => null) : Promise.resolve(null),
    database ? (async () => {
      await ensureSchema();
      const rows = await db()`
        select
          exists(select 1 from service_music_connections where singleton_id = 1 and status = 'connected' and encrypted_access_token is not null) as service_account,
          exists(
            select 1 from tastemakers t join music_connections mc on mc.tastemaker_id = t.id
            where t.status = 'active' and t.is_public = true and t.publish_enabled = true
              and mc.status = 'connected' and mc.encrypted_access_token is not null
          ) as active_publisher
      `;
      return { serviceAccount: Boolean(rows[0]?.service_account), activePublisher: Boolean(rows[0]?.active_publisher) };
    })().catch(() => ({ serviceAccount: false, activePublisher: false })) : Promise.resolve({ serviceAccount: false, activePublisher: false })
  ]);
  const checks = {
    database,
    yandexId: isYandexIdConfigured(),
    musicConnector: isConnectorConfigured(),
    connectorOnline,
    playlistSync: featureFlag("PLAYLIST_SYNC_ENABLED"),
    serviceAccount: liveState.serviceAccount,
    activePublisher: liveState.activePublisher,
    singleAdminAllowlist: hasSingleAdminConfigured(),
    ownerLogin: isOwnerLoginConfigured()
  };
  const automationHealthy = Boolean(automation && !automation.overdue && ["success", "running"].includes(automation.status));
  const coreHealthy = checks.database && checks.yandexId && checks.musicConnector && checks.connectorOnline && checks.singleAdminAllowlist && checks.ownerLogin;
  const readyForLivePilot = coreHealthy && checks.playlistSync && checks.serviceAccount && checks.activePublisher && automationHealthy;
  return NextResponse.json({
    ok: coreHealthy,
    readyForLivePilot,
    checks: { ...checks, automation: automationHealthy, telegram: telegramNotificationsConfigured() },
    automation,
    mode: checks.database ? "database" : "fixture",
    timestamp: new Date().toISOString()
  }, { status: coreHealthy ? 200 : 503 });
}
