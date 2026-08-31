import { NextResponse } from "next/server";
import { hasSingleAdminConfigured, isConnectorConfigured, isDatabaseConfigured, isOwnerLoginConfigured, isYandexIdConfigured } from "@/lib/server/config";

export function GET() {
  const checks = { database: isDatabaseConfigured(), yandexId: isYandexIdConfigured(), musicConnector: isConnectorConfigured(), singleAdminAllowlist: hasSingleAdminConfigured(), ownerLogin: isOwnerLoginConfigured() };
  return NextResponse.json({ ok: true, readyForLivePilot: Object.values(checks).every(Boolean), checks, mode: checks.database ? "database" : "fixture", timestamp: new Date().toISOString() });
}
