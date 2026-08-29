import "server-only";
import { cookies } from "next/headers";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import { hashToken, randomToken } from "@/lib/server/crypto";
import type { SessionUser } from "@/types/domain";

const COOKIE = "taste_session";
const SESSION_DAYS = 14;

export async function createSession(userId: string) {
  await ensureSchema();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()`insert into sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expiresAt})`;
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token && isDatabaseConfigured()) {
    await ensureSchema();
    await db()`delete from sessions where token_hash = ${hashToken(token)}`.catch(() => undefined);
  }
  store.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isDatabaseConfigured()) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const rows = await db()`
    select u.id, u.role, u.display_name, u.avatar_url, ai.provider_user_id as yandex_id
    from sessions s
    join users u on u.id = s.user_id and u.is_active = true
    join auth_identities ai on ai.user_id = u.id and ai.provider = 'yandex_id'
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, role: row.role, displayName: row.display_name, avatarUrl: row.avatar_url, yandexId: row.yandex_id } as SessionUser;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireRole(role: "creator" | "admin") {
  const user = await requireUser();
  if (role === "admin" && user.role !== "admin") throw new Error("FORBIDDEN");
  if (role === "creator" && !["creator", "admin"].includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

