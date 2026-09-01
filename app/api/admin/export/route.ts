import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const string = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${string.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try { await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  await ensureSchema();
  const requestedKind = request.nextUrl.searchParams.get("kind") || "daily";
  const kind = ["daily", "followers", "telegram"].includes(requestedKind) ? requestedKind : "daily";
  const tastemakerId = request.nextUrl.searchParams.get("tastemakerId");

  let rows: Array<Record<string, unknown>>;
  if (kind === "followers") {
    const rawRows = tastemakerId
      ? await db()`select t.name, t.slug, f.user_id, f.followed_at, f.unfollowed_at, f.acquisition_source from follows f join tastemakers t on t.id = f.tastemaker_id where f.tastemaker_id = ${tastemakerId} order by f.followed_at desc limit 50000`
      : await db()`select t.name, t.slug, f.user_id, f.followed_at, f.unfollowed_at, f.acquisition_source from follows f join tastemakers t on t.id = f.tastemaker_id order by f.followed_at desc limit 50000`;
    rows = rawRows.map(row => ({
      "Тейстмейкер": row.name, "Адрес страницы": row.slug, "Пользователь": row.user_id,
      "Подписался": row.followed_at, "Отписался": row.unfollowed_at, "Источник": row.acquisition_source
    }));
  } else if (kind === "telegram") {
    const rawRows = tastemakerId
      ? await db()`select t.name, t.slug, td.user_id, td.event_count, td.status, td.sent_at, td.clicked_at, td.error_code from telegram_deliveries td join tastemakers t on t.id = td.tastemaker_id where td.tastemaker_id = ${tastemakerId} order by td.created_at desc limit 50000`
      : await db()`select t.name, t.slug, td.user_id, td.event_count, td.status, td.sent_at, td.clicked_at, td.error_code from telegram_deliveries td join tastemakers t on t.id = td.tastemaker_id order by td.created_at desc limit 50000`;
    rows = rawRows.map(row => ({
      "Тейстмейкер": row.name, "Адрес страницы": row.slug, "Пользователь": row.user_id,
      "Новых событий": row.event_count, "Статус": row.status, "Отправлено": row.sent_at,
      "Переход": row.clicked_at, "Ошибка": row.error_code
    }));
  } else {
    const rawRows = tastemakerId
      ? await db()`select date_trunc('day', a.created_at)::date as day, t.name, t.slug, a.event_name, count(*)::int as events, count(distinct coalesce(a.user_id::text, a.anonymous_id))::int as unique_people from analytics_events a join tastemakers t on t.id = a.tastemaker_id where a.tastemaker_id = ${tastemakerId} group by 1,2,3,4 order by 1 desc limit 50000`
      : await db()`select date_trunc('day', a.created_at)::date as day, t.name, t.slug, a.event_name, count(*)::int as events, count(distinct coalesce(a.user_id::text, a.anonymous_id))::int as unique_people from analytics_events a left join tastemakers t on t.id = a.tastemaker_id group by 1,2,3,4 order by 1 desc limit 50000`;
    rows = rawRows.map(row => ({
      "Дата": row.day, "Тейстмейкер": row.name, "Адрес страницы": row.slug,
      "Событие": row.event_name, "Количество": row.events, "Уникальные посетители": row.unique_people
    }));
  }

  const headers = rows.length ? Object.keys(rows[0]) : ["Результат"];
  const csv = `\uFEFF${[headers.map(csvCell).join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\n")}`;
  const label = kind === "followers" ? "подписки" : kind === "telegram" ? "telegram" : "аналитика";
  return new NextResponse(csv, { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${label}-${new Date().toISOString().slice(0, 10)}.csv`)}`
  } });
}
