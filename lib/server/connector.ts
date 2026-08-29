import "server-only";
import { isConnectorConfigured } from "@/lib/server/config";

type ConnectorErrorPayload = { detail?: string; code?: string };

export async function connectorRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  if (!isConnectorConfigured()) throw new Error("MUSIC_CONNECTOR_DISABLED");
  const base = (process.env.MUSIC_CONNECTOR_INTERNAL_URL || "").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-internal-secret": process.env.MUSIC_CONNECTOR_INTERNAL_SECRET || "" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ConnectorErrorPayload;
    throw new Error(payload.code || payload.detail || `CONNECTOR_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type DeviceChallenge = { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number };
export type DevicePoll = { status: "pending" | "connected"; accessToken?: string; refreshToken?: string | null; expiresIn?: number | null; account?: { id: string; login: string | null; displayName: string | null } };

