import { NextRequest, NextResponse } from "next/server";
import { appUrl, hasSingleAdminConfigured, isAdminYandexId } from "@/lib/server/config";
import { hashToken, verifyPassword } from "@/lib/server/crypto";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import { sameOrigin } from "@/lib/server/security";
import { createSession, getSessionUser } from "@/lib/server/session";

function adminRedirect(request: NextRequest, state: string) {
  const target = new URL("/admin", appUrl() || request.url);
  target.searchParams.set("login", state);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  if (!isDatabaseConfigured() || !hasSingleAdminConfigured()) return adminRedirect(request, "unavailable");
  const currentUser = await getSessionUser();
  if (!currentUser || currentUser.role !== "admin" || currentUser.authContext !== "yandex" || !isAdminYandexId(currentUser.yandexId)) {
    return adminRedirect(request, "unavailable");
  }

  const form = await request.formData().catch(() => null);
  const username = String(form?.get("username") || "").trim().slice(0, 80);
  const password = String(form?.get("password") || "").slice(0, 200);
  const expectedUsername = process.env.ADMIN_LOGIN_USERNAME || "";
  const passwordHash = process.env.ADMIN_LOGIN_PASSWORD_HASH || "";
  if (!expectedUsername || !passwordHash) return adminRedirect(request, "unavailable");

  await ensureSchema();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = hashToken(`${forwarded || "unknown"}:${request.headers.get("user-agent") || "unknown"}`);
  const attempts = await db()`select count(*)::int as count from admin_login_attempts where client_key = ${clientKey} and attempted_at >= now() - interval '15 minutes'`;
  if (Number(attempts[0]?.count || 0) >= 5) return adminRedirect(request, "locked");
  await db()`insert into admin_login_attempts (client_key) values (${clientKey})`;
  await db()`delete from admin_login_attempts where attempted_at < now() - interval '24 hours'`;

  const credentialsValid = username === expectedUsername && verifyPassword(password, passwordHash);
  if (!credentialsValid) return adminRedirect(request, "failed");

  await createSession(currentUser.id, "owner_password");
  await db()`delete from admin_login_attempts where client_key = ${clientKey}`;
  return NextResponse.redirect(new URL("/admin", appUrl() || request.url), 303);
}
