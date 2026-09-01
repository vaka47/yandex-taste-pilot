import "server-only";
import { isAdminYandexId, yandexRedirectUri } from "@/lib/server/config";
import { db, ensureSchema } from "@/lib/server/db";

type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: string; error_description?: string };
type YandexProfile = {
  id: string;
  login?: string;
  display_name?: string;
  real_name?: string;
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
  default_email?: string;
};

export async function exchangeYandexCode(code: string, verifier: string) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.YANDEX_ID_CLIENT_ID || "",
    client_secret: process.env.YANDEX_ID_CLIENT_SECRET || "",
    redirect_uri: yandexRedirectUri(),
    code_verifier: verifier
  });
  const response = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
    cache: "no-store"
  });
  const payload = await response.json() as TokenResponse;
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "YANDEX_TOKEN_EXCHANGE_FAILED");
  return payload.access_token;
}

export async function fetchYandexProfile(accessToken: string) {
  const response = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${accessToken}`, accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("YANDEX_PROFILE_FETCH_FAILED");
  const profile = await response.json() as YandexProfile;
  if (!profile.id) throw new Error("YANDEX_PROFILE_ID_MISSING");
  return profile;
}

export async function upsertYandexUser(profile: YandexProfile) {
  await ensureSchema();
  const displayName = profile.display_name || profile.real_name || profile.login || "Пользователь Тейста";
  const avatarUrl = profile.default_avatar_id && !profile.is_avatar_empty
    ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
    : null;
  const bootstrapAdmin = isAdminYandexId(profile.id);
  const rows = await db().begin(async sql => {
    const existing = await sql`
      select u.id, u.role from auth_identities ai join users u on u.id = ai.user_id
      where ai.provider = 'yandex_id' and ai.provider_user_id = ${profile.id}
      for update
    `;
    if (existing[0]) {
      const role = bootstrapAdmin ? "admin" : existing[0].role;
      await sql`update users set display_name = ${displayName}, avatar_url = ${avatarUrl}, email = ${profile.default_email || null}, role = ${role}, last_login_at = now(), updated_at = now() where id = ${existing[0].id}`;
      return [{ id: existing[0].id, role }];
    }
    const created = await sql`insert into users (display_name, avatar_url, email, role, last_login_at) values (${displayName}, ${avatarUrl}, ${profile.default_email || null}, ${bootstrapAdmin ? "admin" : "user"}, now()) returning id, role`;
    await sql`insert into auth_identities (user_id, provider, provider_user_id, provider_username) values (${created[0].id}, 'yandex_id', ${profile.id}, ${profile.login || null})`;
    return created;
  });
  return { id: rows[0].id as string, role: rows[0].role as string, displayName, yandexId: profile.id };
}
