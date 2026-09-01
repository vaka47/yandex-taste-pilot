import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";

function csvCell(value: unknown) {
  const string = String(value ?? "");
  return `"${string.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try { await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  await ensureSchema();
  const kind = request.nextUrl.searchParams.get("kind") || "daily";
  const tastemakerId = request.nextUrl.searchParams.get("tastemakerId");
  const rawRows = kind === "followers"
    ? tastemakerId
      ? await db()`select t.name, t.slug, f.user_id, f.followed_at, f.unfollowed_at, f.acquisition_source from follows f join tastemakers t on t.id = f.tastemaker_id where f.tastemaker_id = ${tastemakerId} order by f.followed_at desc limit 50000`
      : await db()`select t.name, t.slug, f.user_id, f.followed_at, f.unfollowed_at, f.acquisition_source from follows f join tastemakers t on t.id = f.tastemaker_id order by f.followed_at desc limit 50000`
    : tastemakerId
      ? await db()`select date_trunc('day', a.created_at)::date as day, t.name, t.slug, a.event_name, count(*)::int as events, count(distinct coalesce(a.user_id::text, a.anonymous_id))::int as unique_people from analytics_events a join tastemakers t on t.id = a.tastemaker_id where a.tastemaker_id = ${tastemakerId} group by 1,2,3,4 order by 1 desc limit 50000`
      : await db()`select date_trunc('day', a.created_at)::date as day, t.name, t.slug, a.event_name, count(*)::int as events, count(distinct coalesce(a.user_id::text, a.anonymous_id))::int as unique_people from analytics_events a left join tastemakers t on t.id = a.tastemaker_id group by 1,2,3,4 order by 1 desc limit 50000`;
  const rows = rawRows.map(row => kind === "followers" ? {
    "Тейстмейкер": row.name,
    "Адрес страницы": row.slug,
    "Пользователь": row.user_id,
    "Подписался": row.followed_at,
    "Отписался": row.unfollowed_at,
    "Источник": row.acquisition_source
  } : {
    "Дата": row.day,
    "Тейстмейкер": row.name,
    "Адрес страницы": row.slug,
    "Событие": row.event_name,
    "Количество": row.events,
    "Уникальные посетители": row.unique_people
  });
  const headers = rows.length ? Object.keys(rows[0]) : ["Результат"];
  const csv = `\uFEFF${[headers.map(csvCell).join(","), ...rows.map(row => headers.map(key => csvCell(row[key as keyof typeof row])).join(","))].join("\n")}`;
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`аналитика-${new Date().toISOString().slice(0, 10)}.csv`)}` } });
}
