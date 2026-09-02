import "server-only";
import { appUrl, telegramNotificationsConfigured } from "@/lib/server/config";
import { hashToken, randomToken } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";

type TelegramUser = { id: number; username?: string; first_name?: string };
type TelegramMessage = { message_id: number; text?: string; chat: { id: number; type: string }; from?: TelegramUser };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage };

type TelegramApiResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

function botUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function telegramRequest<T>(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  const result = await response.json().catch(() => null) as TelegramApiResponse<T> | null;
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.description || "TELEGRAM_REQUEST_FAILED") as Error & { code?: number };
    error.code = result?.error_code || response.status;
    throw error;
  }
  return result.result as T;
}

async function sendMessage(chatId: string, text: string, button?: { label: string; url: string }) {
  return telegramRequest<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.label, url: button.url }]] } } : {})
  });
}

function moscowMinuteOfDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? -1);
  const minute = Number(parts.find(part => part.type === "minute")?.value ?? -1);
  return hour < 0 || minute < 0 ? -1 : hour * 60 + minute;
}

function digestSlotMinute(slotIndex: number, slotCount: number) {
  if (slotCount <= 1) return 20 * 60;
  const firstSlot = 12 * 60;
  const lastSlot = 21 * 60;
  return firstSlot + Math.round((lastSlot - firstSlot) * slotIndex / Math.max(1, slotCount - 1));
}

export async function setupTelegramWebhook() {
  if (!telegramNotificationsConfigured()) throw new Error("TELEGRAM_NOT_CONFIGURED");
  return telegramRequest<boolean>("setWebhook", {
    url: `${appUrl()}/api/telegram/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: false
  });
}

export async function claimTelegramUpdate(updateId: number) {
  await ensureSchema();
  const rows = await db()`insert into telegram_webhook_updates (update_id) values (${updateId}) on conflict do nothing returning update_id`;
  if (rows[0] && updateId % 100 === 0) {
    await db()`delete from telegram_webhook_updates where received_at < now() - interval '30 days'`;
  }
  return Boolean(rows[0]);
}

export async function createTelegramLink(userId: string, tastemakerId: string) {
  if (!telegramNotificationsConfigured()) throw new Error("TELEGRAM_NOT_CONFIGURED");
  await ensureSchema();
  const eligible = await db()`
    select t.id from follows f
    join tastemakers t on t.id = f.tastemaker_id and t.is_public = true and t.status in ('active','paused')
    where f.user_id = ${userId} and f.tastemaker_id = ${tastemakerId} and f.unfollowed_at is null
    limit 1
  `;
  if (!eligible[0]) throw new Error("FOLLOW_REQUIRED");
  const connected = await db()`
    select user_id from telegram_accounts
    where user_id = ${userId} and status = 'active'
    limit 1
  `;
  if (connected[0]) {
    await db()`
      insert into telegram_subscriptions (user_id, tastemaker_id, active, subscribed_at, unsubscribed_at)
      values (${userId}, ${tastemakerId}, true, now(), null)
      on conflict (user_id, tastemaker_id) do update
      set active = true, subscribed_at = now(), unsubscribed_at = null, updated_at = now()
    `;
    return { subscribed: true, connected: true, expiresInSeconds: 0 };
  }
  const rawToken = randomToken(24);
  await db().begin(async sql => {
    await sql`update telegram_link_tokens set used_at = now() where user_id = ${userId} and tastemaker_id = ${tastemakerId} and used_at is null`;
    await sql`
      insert into telegram_link_tokens (token_hash, user_id, tastemaker_id, expires_at)
      values (${hashToken(rawToken)}, ${userId}, ${tastemakerId}, now() + interval '15 minutes')
    `;
  });
  return { subscribed: false, connected: false, url: `https://t.me/${botUsername()}?start=${rawToken}`, expiresInSeconds: 900 };
}

export async function getTelegramSubscriptionStatus(userId: string, tastemakerId: string) {
  await ensureSchema();
  const rows = await db()`
    select exists(select 1 from telegram_accounts where user_id = ${userId} and status = 'active') as connected,
      exists(select 1 from telegram_subscriptions where user_id = ${userId} and tastemaker_id = ${tastemakerId} and active = true) as subscribed
  `;
  return { available: telegramNotificationsConfigured(), connected: Boolean(rows[0]?.connected), subscribed: Boolean(rows[0]?.subscribed) };
}

export async function disableTelegramSubscription(userId: string, tastemakerId: string) {
  await ensureSchema();
  const rows = await db()`
    update telegram_subscriptions set active = false, unsubscribed_at = now(), updated_at = now()
    where user_id = ${userId} and tastemaker_id = ${tastemakerId} and active = true
    returning id
  `;
  return Boolean(rows[0]);
}

async function consumeStartToken(rawToken: string, message: TelegramMessage) {
  if (!message.from || message.chat.type !== "private") throw new Error("PRIVATE_CHAT_REQUIRED");
  await ensureSchema();
  const result = await db().begin(async sql => {
    const links = await sql`
      select l.id, l.user_id, l.tastemaker_id, t.name, t.slug
      from telegram_link_tokens l
      join tastemakers t on t.id = l.tastemaker_id and t.is_public = true and t.status in ('active','paused')
      join follows f on f.user_id = l.user_id and f.tastemaker_id = l.tastemaker_id and f.unfollowed_at is null
      where l.token_hash = ${hashToken(rawToken)} and l.used_at is null and l.expires_at > now()
      for update of l
    `;
    const link = links[0];
    if (!link) throw new Error("LINK_EXPIRED");
    const telegramId = String(message.from!.id);
    const existing = await sql`select user_id from auth_identities where provider = 'telegram' and provider_user_id = ${telegramId} limit 1`;
    if (existing[0] && String(existing[0].user_id) !== String(link.user_id)) throw new Error("TELEGRAM_ALREADY_LINKED");
    await sql`
      insert into auth_identities (user_id, provider, provider_user_id, provider_username)
      values (${link.user_id}, 'telegram', ${telegramId}, ${message.from!.username || null})
      on conflict (provider, provider_user_id) do update set provider_username = excluded.provider_username
    `;
    await sql`
      insert into telegram_accounts (user_id, telegram_user_id, chat_id, username, first_name, status)
      values (${link.user_id}, ${telegramId}, ${String(message.chat.id)}, ${message.from!.username || null}, ${message.from!.first_name || null}, 'active')
      on conflict (user_id) do update set telegram_user_id = excluded.telegram_user_id, chat_id = excluded.chat_id,
        username = excluded.username, first_name = excluded.first_name, status = 'active', last_seen_at = now(), updated_at = now()
    `;
    await sql`
      insert into telegram_subscriptions (user_id, tastemaker_id, active, subscribed_at, unsubscribed_at)
      values (${link.user_id}, ${link.tastemaker_id}, true, now(), null)
      on conflict (user_id, tastemaker_id) do update set active = true, subscribed_at = now(), unsubscribed_at = null, updated_at = now()
    `;
    await sql`
      insert into analytics_events (event_name, user_id, session_id, tastemaker_id, properties, utm_source, utm_medium)
      values ('telegram_connected', ${link.user_id}, ${`telegram-link:${link.id}`}, ${link.tastemaker_id},
        ${sql.json({ telegramUsernamePresent: Boolean(message.from!.username) })}, 'telegram', 'bot')
    `;
    await sql`update telegram_link_tokens set used_at = now() where id = ${link.id}`;
    return { userId: String(link.user_id), tastemakerId: String(link.tastemaker_id), name: String(link.name), slug: String(link.slug) };
  });
  await sendMessage(
    String(message.chat.id),
    `Готово! Вы подписались на обновления <a href="${appUrl()}/t/${result.slug}?utm_source=telegram&utm_medium=bot&utm_campaign=connected"><b>${html(result.name)}</b></a>.\n\nКогда в истории появится новая музыка, Taste пришлёт одну дневную сводку. Новые комментарии Саундмейкера придут сразу.\n\nОтключить уведомления можно в профиле Саундмейкера или командой /stop.`,
    { label: "Открыть профиль", url: `${appUrl()}/t/${result.slug}?utm_source=telegram&utm_medium=bot&utm_campaign=connected` }
  );
  return result;
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text || !message.from) return { handled: false };
  const text = message.text.trim();
  if (text.startsWith("/start ")) {
    const rawToken = text.slice(7).trim();
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) throw new Error("LINK_INVALID");
    return { handled: true, connected: await consumeStartToken(rawToken, message) };
  }
  if (text === "/stop") {
    await ensureSchema();
    await db()`
      update telegram_subscriptions ts set active = false, unsubscribed_at = now(), updated_at = now()
      from telegram_accounts ta where ta.user_id = ts.user_id and ta.telegram_user_id = ${String(message.from.id)} and ts.active = true
    `;
    await sendMessage(String(message.chat.id), "Уведомления остановлены. Их можно снова включить в профиле любого Саундмейкера в Taste.");
    return { handled: true };
  }
  await sendMessage(String(message.chat.id), "Откройте профиль Саундмейкера в Taste и нажмите «Уведомлять в Telegram». Команда /stop отключит все уведомления.");
  return { handled: true };
}

export async function notifyTelegramUpdateError(update: TelegramUpdate, error: unknown) {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const code = error instanceof Error ? error.message : "TELEGRAM_LINK_FAILED";
  const text = code === "LINK_EXPIRED" || code === "LINK_INVALID"
    ? "Ссылка устарела или уже использована. Вернитесь в профиль Саундмейкера и нажмите «Уведомлять в Telegram» ещё раз."
    : code === "TELEGRAM_ALREADY_LINKED"
      ? "Этот Telegram уже связан с другим аккаунтом Taste. Отключите уведомления командой /stop и войдите в нужный аккаунт."
      : "Не удалось включить уведомления. Получите новую ссылку в профиле Саундмейкера и попробуйте ещё раз.";
  await sendMessage(String(chatId), text).catch(() => undefined);
}

export async function dispatchDailyTelegramNotifications() {
  if (!telegramNotificationsConfigured()) return { enabled: false, attempted: 0, sent: 0, failed: 0 };
  // Each listener gets stable daytime slots spread across all active
  // subscriptions. A narrow window avoids a burst when many makers update.
  const currentMinute = moscowMinuteOfDay();
  if (currentMinute < 12 * 60 || currentMinute >= 21 * 60 + 15) return { enabled: true, attempted: 0, sent: 0, failed: 0 };
  await ensureSchema();
  const subscriptions = await db()`
    with active_subscriptions as (
      select ts.*,
        (row_number() over (partition by ts.user_id order by ts.tastemaker_id) - 1)::int as slot_index,
        count(*) over (partition by ts.user_id)::int as slot_count
      from telegram_subscriptions ts
      where ts.active = true
    )
    select ts.id, ts.user_id, ts.tastemaker_id, ts.subscribed_at, ts.last_notified_at,
      ts.slot_index, ts.slot_count,
      ta.chat_id, t.name, t.slug, p.public_url, p.last_sync_at
    from active_subscriptions ts
    join telegram_accounts ta on ta.user_id = ts.user_id and ta.status = 'active'
    join tastemakers t on t.id = ts.tastemaker_id and t.is_public = true and t.status = 'active' and t.publish_enabled = true
    join playlists p on p.tastemaker_id = t.id and p.public_url is not null
    where ts.active = true
      and (ts.last_notified_at is null or (ts.last_notified_at at time zone 'Europe/Moscow')::date < (now() at time zone 'Europe/Moscow')::date)
      and (ts.notification_locked_until is null or ts.notification_locked_until < now())
    order by ts.last_notified_at asc nulls first
    limit 5000
  `;
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    const slotMinute = digestSlotMinute(Number(subscription.slot_index || 0), Number(subscription.slot_count || 1));
    if (currentMinute < slotMinute || currentMinute >= slotMinute + 15) continue;
    attempted += 1;
    const claim = await db()`
      update telegram_subscriptions
      set notification_locked_until = now() + interval '5 minutes', updated_at = now()
      where id = ${subscription.id} and active = true
        and (last_notified_at is null or (last_notified_at at time zone 'Europe/Moscow')::date < (now() at time zone 'Europe/Moscow')::date)
        and (notification_locked_until is null or notification_locked_until < now())
      returning id
    `;
    if (!claim[0]) continue;
    try {
      const events = await db()`
        select id, track_title, artist_names, fetched_at
        from listening_events
        where tastemaker_id = ${subscription.tastemaker_id} and visibility = 'public' and publish_at <= now()
          and fetched_at > greatest(${subscription.subscribed_at}, coalesce(${subscription.last_notified_at}, ${subscription.subscribed_at}))
        order by fetched_at desc, coalesce((raw_metadata->>'providerPosition')::int, 999999) asc
        limit 25
      `;
      if (!events.length) {
        await db()`update telegram_subscriptions set notification_locked_until = null, updated_at = now() where id = ${subscription.id}`;
        continue;
      }
      const newest = events[0];
      if (!subscription.last_sync_at || new Date(subscription.last_sync_at).getTime() < new Date(newest.fetched_at).getTime()) {
        await db()`update telegram_subscriptions set notification_locked_until = null, updated_at = now() where id = ${subscription.id}`;
        continue;
      }
      const rawClickToken = randomToken(24);
      const deliveries = await db()`
        insert into telegram_deliveries (subscription_id, user_id, tastemaker_id, click_token_hash, event_count, delivery_type)
        values (${subscription.id}, ${subscription.user_id}, ${subscription.tastemaker_id}, ${hashToken(rawClickToken)}, ${events.length}, 'history_digest')
        returning id
      `;
      const firstArtists = Array.isArray(newest.artist_names) ? newest.artist_names.map(String).join(", ") : "";
      const more = events.length > 1 ? `\nИ ещё ${events.length - 1}.` : "";
      const trackedUrl = `${appUrl()}/go/telegram/${rawClickToken}`;
      const message = await sendMessage(
        String(subscription.chat_id),
        `У <a href="${appUrl()}/t/${subscription.slug}?utm_source=telegram&utm_medium=notification&utm_campaign=daily_history"><b>${html(String(subscription.name))}</b></a> обновилась история прослушиваний.\n\nПоследний трек: <b>${html(String(newest.track_title))}</b>${firstArtists ? ` — ${html(firstArtists)}` : ""}.${more}\n\nЖивой плейлист уже обновлён.`,
        { label: "Открыть живой плейлист", url: trackedUrl }
      );
      await db().begin(async sql => {
        await sql`update telegram_deliveries set status = 'sent', telegram_message_id = ${String(message.message_id)}, sent_at = now() where id = ${deliveries[0].id}`;
        await sql`update telegram_subscriptions set last_notified_at = now(), last_notified_event_id = ${newest.id}, notification_locked_until = null, updated_at = now() where id = ${subscription.id}`;
      });
      sent += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "TELEGRAM_SEND_FAILED";
      await db()`
        update telegram_deliveries set status = 'failed', error_code = ${code}
        where subscription_id = ${subscription.id} and status = 'queued'
      `;
      await db()`update telegram_subscriptions set notification_locked_until = null, updated_at = now() where id = ${subscription.id}`;
      if ((error as Error & { code?: number })?.code === 403) {
        await db()`update telegram_accounts set status = 'blocked', updated_at = now() where user_id = ${subscription.user_id}`;
      }
      failed += 1;
    }
  }
  return { enabled: true, attempted, sent, failed };
}

export async function dispatchCreatorCommentNotifications(commentId?: string) {
  if (!telegramNotificationsConfigured()) return { enabled: false, attempted: 0, sent: 0, failed: 0 };
  await ensureSchema();
  // Failed deliveries are safe to retry: the click token is hashed and every
  // successful delivery remains protected by the unique comment index.
  await db()`
    delete from telegram_deliveries
    where delivery_type = 'creator_comment' and status = 'failed'
      and (${commentId || null}::text is null or comment_id::text = ${commentId || null})
  `;
  const subscriptions = await db()`
    select ts.id as subscription_id, ts.user_id, ts.tastemaker_id, ta.chat_id,
      ec.id as comment_id, ec.body, e.id as event_id, e.track_title, e.artist_names,
      t.name, t.slug
    from event_comments ec
    join listening_events e on e.id = ec.listening_event_id and e.visibility = 'public' and e.publish_at <= now()
    join tastemakers t on t.id = ec.tastemaker_id and t.is_public = true and t.status = 'active'
    join telegram_subscriptions ts on ts.tastemaker_id = t.id and ts.active = true
    join telegram_accounts ta on ta.user_id = ts.user_id and ta.status = 'active'
    where ec.is_public = true
      and (${commentId || null}::text is null or ec.id::text = ${commentId || null})
      and not exists (
        select 1 from telegram_deliveries td
        where td.subscription_id = ts.id and td.comment_id = ec.id and td.delivery_type = 'creator_comment'
      )
    order by ec.updated_at asc
    limit 500
  `;
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    const rawClickToken = randomToken(24);
    const deliveries = await db()`
      insert into telegram_deliveries (
        subscription_id, user_id, tastemaker_id, click_token_hash, event_count,
        delivery_type, listening_event_id, comment_id
      ) values (
        ${subscription.subscription_id}, ${subscription.user_id}, ${subscription.tastemaker_id},
        ${hashToken(rawClickToken)}, 1, 'creator_comment', ${subscription.event_id}, ${subscription.comment_id}
      )
      on conflict do nothing
      returning id
    `;
    if (!deliveries[0]) continue;
    try {
      const artists = Array.isArray(subscription.artist_names) ? subscription.artist_names.map(String).join(", ") : "";
      const message = await sendMessage(
        String(subscription.chat_id),
        `<a href="${appUrl()}/t/${subscription.slug}?utm_source=telegram&utm_medium=notification&utm_campaign=creator_comment"><b>${html(String(subscription.name))}</b></a> — новый комментарий к треку <b>${html(String(subscription.track_title))}</b>${artists ? ` — ${html(artists)}` : ""}.\n\n«${html(String(subscription.body))}»`,
        { label: "Открыть трек", url: `${appUrl()}/go/telegram/${rawClickToken}` }
      );
      await db()`update telegram_deliveries set status = 'sent', telegram_message_id = ${String(message.message_id)}, sent_at = now() where id = ${deliveries[0].id}`;
      sent += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "TELEGRAM_SEND_FAILED";
      await db()`update telegram_deliveries set status = 'failed', error_code = ${code} where id = ${deliveries[0].id}`;
      if ((error as Error & { code?: number })?.code === 403) {
        await db()`update telegram_accounts set status = 'blocked', updated_at = now() where user_id = ${subscription.user_id}`;
      }
      failed += 1;
    }
  }
  return { enabled: true, attempted: subscriptions.length, sent, failed };
}

export async function resolveTelegramDelivery(rawToken: string) {
  await ensureSchema();
  const rows = await db().begin(async sql => {
    const deliveries = await sql`
      select td.id, td.user_id, td.tastemaker_id, td.delivery_type,
        case when td.delivery_type = 'creator_comment' then e.yandex_url else p.public_url end as destination_url
      from telegram_deliveries td
      left join playlists p on p.tastemaker_id = td.tastemaker_id
      left join listening_events e on e.id = td.listening_event_id and e.visibility = 'public' and e.publish_at <= now()
      where td.click_token_hash = ${hashToken(rawToken)}
        and case when td.delivery_type = 'creator_comment' then e.yandex_url else p.public_url end is not null
      for update of td
    `;
    if (!deliveries[0]) return [];
    await sql`update telegram_deliveries set status = 'clicked', clicked_at = coalesce(clicked_at, now()) where id = ${deliveries[0].id}`;
    return deliveries;
  });
  const delivery = rows[0] as { user_id?: unknown; tastemaker_id?: unknown; delivery_type?: unknown; destination_url?: unknown } | undefined;
  return delivery ? {
    userId: String(delivery.user_id),
    tastemakerId: String(delivery.tastemaker_id),
    deliveryType: String(delivery.delivery_type),
    destinationUrl: String(delivery.destination_url)
  } : null;
}
