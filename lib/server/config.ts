import "server-only";

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const yandexRedirectUri = () => process.env.YANDEX_ID_REDIRECT_URI || `${appUrl()}/auth/yandex/callback`;
export const isDatabaseConfigured = () => Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
export const isYandexIdConfigured = () => Boolean(process.env.YANDEX_ID_CLIENT_ID && process.env.YANDEX_ID_CLIENT_SECRET);
export const isConnectorConfigured = () => process.env.MUSIC_CONNECTOR_ENABLED === "true" && Boolean(process.env.MUSIC_CONNECTOR_INTERNAL_URL && process.env.MUSIC_CONNECTOR_INTERNAL_SECRET);
export const isOwnerLoginConfigured = () => Boolean(process.env.ADMIN_LOGIN_USERNAME && process.env.ADMIN_LOGIN_PASSWORD_HASH);

export function featureFlag(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

export function adminYandexIds() {
  return new Set((process.env.ADMIN_YANDEX_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
}

export function hasSingleAdminConfigured() {
  return adminYandexIds().size === 1;
}

export function isAdminYandexId(yandexId: string) {
  const ids = adminYandexIds();
  return ids.size === 1 && ids.has(yandexId);
}
