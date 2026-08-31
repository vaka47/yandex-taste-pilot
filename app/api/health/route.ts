import { NextResponse } from "next/server";
import { hasSingleAdminConfigured, isConnectorConfigured, isDatabaseConfigured, isYandexIdConfigured } from "@/lib/server/config";

export function GET() {
  const checks = { database: isDatabaseConfigured(), yandexId: isYandexIdConfigured(), musicConnector: isConnectorConfigured(), singleAdminAllowlist: hasSingleAdminConfigured() };
  return NextResponse.json({ ok: true, readyForLivePilot: Object.values(checks).every(Boolean), checks, mode: checks.database ? "database" : "fixture", timestamp: new Date().toISOString() });
}
