import "server-only";
import { db, ensureSchema } from "@/lib/server/db";
import { connectedTastemakerIds, syncTastemakerFully } from "@/lib/server/sync";
import { dispatchCreatorCommentNotifications, dispatchDailyTelegramNotifications } from "@/lib/server/telegram";

export type AutomationResult = {
  ok: boolean;
  status: "success" | "partial";
  tastemakers: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
  telegram: { enabled: boolean; attempted: number; sent: number; failed: number };
  commentNotifications: { enabled: boolean; attempted: number; sent: number; failed: number };
};

function safeSource(value: string) {
  return ["gcp_scheduler", "github_schedule", "github_watchdog", "vercel_daily", "manual", "unknown"].includes(value) ? value : "unknown";
}

export async function runAutomationCycle(sourceValue = "unknown"): Promise<AutomationResult> {
  await ensureSchema();
  const source = safeSource(sourceValue);
  const runRows = await db()`insert into automation_runs (source, status) values (${source}, 'running') returning id`;
  const runId = runRows[0].id;
  try {
    const ids = await connectedTastemakerIds();
    const results: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < ids.length; offset += 3) {
      const batch = ids.slice(offset, offset + 3);
      const settled = await Promise.all(batch.map(async id => {
        try {
          return { id, ...(await syncTastemakerFully(id)) } as Record<string, unknown>;
        } catch (error) {
          return { id, ok: false, error: error instanceof Error ? error.message : "SYNC_FAILED" } as Record<string, unknown>;
        }
      }));
      results.push(...settled);
    }
    const succeeded = results.filter(result => result.ok === true).length;
    const failed = results.length - succeeded;
    const commentNotifications = await dispatchCreatorCommentNotifications();
    const telegram = await dispatchDailyTelegramNotifications();
    const status = failed || telegram.failed || commentNotifications.failed ? "partial" : "success";
    await db()`
      update automation_runs set status = ${status}, tastemakers_total = ${ids.length},
        tastemakers_succeeded = ${succeeded}, tastemakers_failed = ${failed}, telegram_sent = ${telegram.sent},
        summary = ${db().json({ telegramAttempted: telegram.attempted, telegramFailed: telegram.failed, commentAttempted: commentNotifications.attempted, commentSent: commentNotifications.sent, commentFailed: commentNotifications.failed })}, finished_at = now()
      where id = ${runId}
    `;
    return { ok: status === "success", status, tastemakers: ids.length, succeeded, failed, results, telegram, commentNotifications };
  } catch (error) {
    await db()`
      update automation_runs set status = 'failed', summary = ${db().json({ error: error instanceof Error ? error.message.slice(0, 160) : "AUTOMATION_FAILED" })}, finished_at = now()
      where id = ${runId}
    `;
    throw error;
  }
}

export async function getAutomationState() {
  await ensureSchema();
  const rows = await db()`
    select source, status, started_at, finished_at, tastemakers_total, tastemakers_succeeded,
      tastemakers_failed, telegram_sent,
      started_at < now() - interval '15 minutes' as overdue
    from automation_runs order by started_at desc limit 1
  `;
  const row = rows[0];
  return row ? {
    source: String(row.source),
    status: String(row.status) as "running" | "success" | "partial" | "failed",
    startedAt: row.started_at?.toISOString?.() || String(row.started_at),
    finishedAt: row.finished_at?.toISOString?.() || (row.finished_at ? String(row.finished_at) : null),
    tastemakers: Number(row.tastemakers_total || 0),
    succeeded: Number(row.tastemakers_succeeded || 0),
    failed: Number(row.tastemakers_failed || 0),
    telegramSent: Number(row.telegram_sent || 0),
    overdue: Boolean(row.overdue)
  } : null;
}
