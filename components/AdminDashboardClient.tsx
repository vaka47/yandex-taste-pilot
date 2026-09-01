"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { fullNumber, percent, relativeTime } from "@/lib/format";
import type { AdminDashboardData, AdminTastemakerRow } from "@/lib/server/dashboard";

type Notice = { tone: "success" | "warning"; text: string } | null;
type NewTastemaker = { name: string; slug: string; roleLine: string };
type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };

const statusLabels: Record<string, string> = {
  draft: "черновик", invited: "приглашён", connected: "подключён", active: "активен", paused: "на паузе", disconnected: "отключён", archived: "в архиве"
};
const connectionLabels: Record<string, string> = {
  connected: "подключено", pending: "ожидает", error: "ошибка", disconnected: "отключено", not_connected: "не подключено", starting: "начинаем", waiting: "ждём подтверждения"
};
const playlistLabels: Record<string, string> = { healthy: "работает", paused: "на паузе", error: "ошибка", not_created: "не создан" };

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    tastemaker_created: "Тейстмейкер создан", creator_invite_claimed: "Приглашение принято", creator_invite_created: "Выпущено новое приглашение",
    connector_device_flow_started: "Подключение Яндекс Музыки начато", connector_connected: "Яндекс Музыка подключена",
    service_connector_device_flow_started: "Подключение followtaste начато", service_connector_connected: "followtaste подключён",
    creator_sync_now: "История и плейлист обновлены", creator_playlist_sync: "Плейлист обновлён",
    creator_profile_updated: "Публичная страница изменена", creator_pause: "Публикация поставлена на паузу",
    admin_paused_tastemaker: "Публикация поставлена на паузу", admin_resumed_tastemaker: "Публикация возобновлена"
  };
  return labels[action] || "Системное действие";
}

export function AdminDashboardClient({ initialData }: { initialData: AdminDashboardData }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [draftMaker, setDraftMaker] = useState<NewTastemaker>({ name: "", slug: "", roleLine: "" });
  const [serviceConnectOpen, setServiceConnectOpen] = useState(false);
  const [serviceChallenge, setServiceChallenge] = useState<Challenge | null>(null);
  const [serviceState, setServiceState] = useState<"connected" | "pending" | "error" | "disconnected" | "not_connected" | "starting" | "waiting">(initialData.serviceConnection.status);
  const [serviceLogin, setServiceLogin] = useState(initialData.serviceConnection.login);
  const [tastemakers, setTastemakers] = useState<AdminTastemakerRow[]>(initialData.tastemakers);
  const metrics = initialData.metrics;
  const activeCount = tastemakers.filter(item => item.status === "active").length;
  const connectedCount = tastemakers.filter(item => item.connectionStatus === "connected").length;
  const lastSyncAt = tastemakers.map(item => item.lastSyncAt).filter((value): value is string => Boolean(value)).sort().at(-1) || null;

  useEffect(() => {
    if (!serviceChallenge || serviceState !== "waiting") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/admin/music-service/connect/status/${serviceChallenge.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string; account?: { login?: string | null }; error?: string };
      if (payload.status === "connected") {
        setServiceState("connected");
        setServiceLogin(payload.account?.login || "followtaste");
        setServiceChallenge(null);
        setServiceConnectOpen(false);
        setNotice({ tone: "success", text: "Аккаунт followtaste подключён. Плейлисты готовы к автоматическому обновлению." });
      } else if (!response.ok && response.status !== 202) {
        setServiceState("error");
        setNotice({ tone: "warning", text: "Не удалось подключить followtaste. Получите новый код и попробуйте ещё раз." });
      }
    }, Math.max(5000, serviceChallenge.interval * 1000));
    return () => window.clearInterval(interval);
  }, [serviceChallenge, serviceState]);

  async function startServiceConnection() {
    setServiceState("starting");
    const response = await fetch("/api/admin/music-service/connect/start", { method: "POST" });
    const payload = await response.json().catch(() => ({})) as Challenge & { error?: string };
    if (!response.ok) {
      setServiceState("error");
      setNotice({ tone: "warning", text: "Не удалось начать подключение followtaste. Связь с Яндекс Музыкой не изменилась." });
      return;
    }
    setServiceChallenge(payload);
    setServiceState("waiting");
  }

  async function action(type: string, tastemakerId?: string, payload: Partial<NewTastemaker> = {}) {
    setBusy(`${type}:${tastemakerId || "global"}`);
    const response = await fetch("/api/admin/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, tastemakerId, ...payload }) });
    const result = await response.json().catch(() => ({})) as { id?: string; slug?: string; inviteUrl?: string; error?: string };
    setBusy(null);
    if (response.ok && result.inviteUrl) {
      if (type === "create_tastemaker" && result.id) {
        setTastemakers(items => [{ id: result.id!, slug: result.slug || payload.slug || "new-author", name: payload.name || "Новый автор", avatarUrl: null, status: "invited", registered: false, followerCount: 0, profileViews7d: 0, uniqueVisitors7d: 0, historyUnlocks7d: 0, authCompletions7d: 0, followClicks7d: 0, follows7d: 0, trackOpens7d: 0, playlistOpens7d: 0, shares7d: 0, telegramSubscribers: 0, telegramClicks7d: 0, returnVisitors7d: 0, d1Retention: 0, d7Retention: 0, followerD7Retention: 0, lastSyncAt: null, playlistUrl: null, playlistStatus: "not_created", connectionStatus: "not_connected" }, ...items]);
        setInviteOpen(false);
        setDraftMaker({ name: "", slug: "", roleLine: "" });
      }
      setInviteLink(result.inviteUrl);
      await navigator.clipboard?.writeText(result.inviteUrl).catch(() => undefined);
      setNotice({ tone: "success", text: "Одноразовая ссылка скопирована. После первой регистрации она сгорит." });
      return;
    }
    if (response.ok && type === "pause" && tastemakerId) setTastemakers(items => items.map(item => item.id === tastemakerId ? { ...item, status: item.status === "paused" ? "active" : "paused", playlistStatus: item.status === "paused" ? item.playlistStatus : "paused" } : item));
    const errorText = result.error === "ACTION_FAILED" ? "Не удалось выполнить действие. Возможно, такой адрес страницы уже занят." : result.error === "NOT_FOUND" && type === "create_invite" ? "Профиль уже зарегистрирован: повторный инвайт для него закрыт." : "Действие не выполнено. Проверьте состояние подключения.";
    setNotice(response.ok ? { tone: "success", text: type === "sync" ? "История проверена, плейлист обновлён." : type === "setup_telegram" ? "Telegram-вебхук подключён и готов принимать подтверждения." : "Изменение применено." } : { tone: "warning", text: errorText });
  }

  return (
    <>
      <header className="workspaceTopbar"><div><span>кабинет владельца · последние 7 дней</span><h1>Пилот под контролем</h1></div><div><a className="ghostButton" href="/api/admin/export?kind=daily"><Icon name="arrow" />Выгрузить аналитику</a><button type="button" className="darkButton" onClick={() => setInviteOpen(true)}><Icon name="users" />Пригласить тейстмейкера</button></div></header>
      {notice ? <div className={`workspaceNotice ${notice.tone}`} role="status"><Icon name={notice.tone === "success" ? "check" : "shield"} /><span>{notice.text}{inviteLink ? <> <a href={inviteLink} target="_blank" rel="noreferrer">Открыть ссылку</a></> : null}</span><button type="button" onClick={() => { setNotice(null); setInviteLink(null); }} aria-label="Закрыть"><Icon name="x" size={17} /></button></div> : null}

      <section className="metricStrip" aria-label="Общие показатели">
        <article><span>активные авторы</span><strong>{activeCount} <small>/ {tastemakers.length}</small></strong><em>{connectedCount} подключили историю</em></article>
        <article><span>уникальные посетители · 7 дней</span><strong>{fullNumber(metrics.uniqueVisitors7d)}</strong><em>{fullNumber(metrics.profileViews7d)} просмотров · D7 {metrics.d7Retention}%</em></article>
        <article><span>новые подписки · 7 дней</span><strong>{fullNumber(metrics.follows7d)}</strong><em>{percent(metrics.follows7d, metrics.uniqueVisitors7d)} от посетителей</em></article>
        <article><span>переходы к музыке · 7 дней</span><strong>{fullNumber(metrics.trackOpens7d + metrics.playlistOpens7d)}</strong><em>{fullNumber(metrics.trackOpens7d)} к трекам · {fullNumber(metrics.playlistOpens7d)} к плейлистам</em></article>
        <article className={initialData.telegram.configured ? "" : "metricAlert"}><span>Telegram-уведомления</span><strong>{fullNumber(initialData.telegram.activeSubscriptions)}</strong><em>{initialData.telegram.configured ? `${initialData.telegram.sent7d} отправлено · ${initialData.telegram.clicks7d} переходов` : "нужны реквизиты бота"}</em></article>
      </section>

      <section className="adminPanel makersPanel" id="tastemakers">
        <header><div><span>аналитика по каждому автору</span><h2>Тейстмейкеры</h2></div><small>Нажмите на карточку, чтобы увидеть всю воронку</small></header>
        <div className="adminMakerGrid">{tastemakers.map(item => {
          const musicActions = item.trackOpens7d + item.playlistOpens7d;
          const funnelBase = Math.max(item.uniqueVisitors7d, 1);
          return <details className="adminMakerCard" key={item.id}>
            <summary><span className="tableAvatar">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : item.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span><div><strong>{item.name}</strong><small>/t/{item.slug}</small></div><span className={`statusTag status-${item.status}`}><i />{statusLabels[item.status]}</span><div className="makerHeadlineMetric"><strong>{fullNumber(item.uniqueVisitors7d)}</strong><small>посетителей</small></div><div className="makerHeadlineMetric"><strong>{fullNumber(item.followerCount)}</strong><small>всего подписчиков</small></div><Icon name="arrow" /></summary>
            <div className="makerFunnel" aria-label={`Воронка ${item.name}`}>
              <div><span>Увидели страницу</span><strong>{fullNumber(item.uniqueVisitors7d)}</strong><i style={{ width: "100%" }} /><small>основа воронки</small></div>
              <div><span>Хотели открыть историю</span><strong>{fullNumber(item.historyUnlocks7d)}</strong><i style={{ width: `${Math.min(100, item.historyUnlocks7d / funnelBase * 100)}%` }} /><small>{percent(item.historyUnlocks7d, item.uniqueVisitors7d)} от посетителей</small></div>
              <div><span>Завершили вход</span><strong>{fullNumber(item.authCompletions7d)}</strong><i style={{ width: `${Math.min(100, item.authCompletions7d / funnelBase * 100)}%` }} /><small>{percent(item.authCompletions7d, item.historyUnlocks7d)} от намерения</small></div>
              <div><span>Нажали «Следить»</span><strong>{fullNumber(item.followClicks7d)}</strong><i style={{ width: `${Math.min(100, item.followClicks7d / funnelBase * 100)}%` }} /><small>{percent(item.followClicks7d, item.uniqueVisitors7d)} от посетителей</small></div>
              <div><span>Подписались</span><strong>{fullNumber(item.follows7d)}</strong><i style={{ width: `${Math.min(100, item.follows7d / funnelBase * 100)}%` }} /><small>{percent(item.follows7d, item.uniqueVisitors7d)} конверсия</small></div>
              <div><span>Перешли к музыке</span><strong>{fullNumber(musicActions)}</strong><i style={{ width: `${Math.min(100, musicActions / funnelBase * 100)}%` }} /><small>{percent(musicActions, item.uniqueVisitors7d)} от посетителей</small></div>
              <div><span>Включили Telegram</span><strong>{fullNumber(item.telegramSubscribers)}</strong><i style={{ width: `${Math.min(100, item.telegramSubscribers / funnelBase * 100)}%` }} /><small>{percent(item.telegramSubscribers, item.uniqueVisitors7d)} от посетителей</small></div>
            </div>
            <div className="makerAnalytics"><div><span>Все просмотры страницы</span><strong>{fullNumber(item.profileViews7d)}</strong></div><div><span>Вернулись в другой день</span><strong>{fullNumber(item.returnVisitors7d)}</strong><small>{percent(item.returnVisitors7d, item.uniqueVisitors7d)} от посетителей</small></div><div><span>Удержание D1</span><strong>{item.d1Retention}%</strong><small>вернулись на следующий день</small></div><div><span>Удержание D7</span><strong>{item.d7Retention}%</strong><small>подписчики: {item.followerD7Retention}%</small></div><div><span>Открыли трек</span><strong>{fullNumber(item.trackOpens7d)}</strong></div><div><span>Открыли плейлист</span><strong>{fullNumber(item.playlistOpens7d)}</strong></div><div><span>Перешли из Telegram</span><strong>{fullNumber(item.telegramClicks7d)}</strong></div><div><span>Поделились страницей</span><strong>{fullNumber(item.shares7d)}</strong></div></div>
            <footer><div><span>История: <b>{connectionLabels[item.connectionStatus]}</b></span><span>Плейлист: <b>{playlistLabels[item.playlistStatus]}</b></span><span>Обновление: <b>{item.lastSyncAt ? relativeTime(item.lastSyncAt) : "ещё не было"}</b></span></div><nav><a href={`/t/${item.slug}`} target="_blank" rel="noreferrer"><Icon name="eye" />Открыть страницу</a><a href={`/api/admin/export?kind=daily&tastemakerId=${item.id}`}><Icon name="arrow" />Выгрузить данные</a>{item.connectionStatus === "connected" ? <button type="button" disabled={busy === `sync:${item.id}`} onClick={() => void action("sync", item.id)}><Icon name="sync" />{busy === `sync:${item.id}` ? "Обновляем…" : "Обновить сейчас"}</button> : null}{!item.registered ? <button type="button" disabled={busy === `create_invite:${item.id}`} onClick={() => void action("create_invite", item.id)}><Icon name="copy" />Новая ссылка</button> : null}{["active", "paused"].includes(item.status) ? <button type="button" disabled={busy === `pause:${item.id}`} onClick={() => void action("pause", item.id)}><Icon name={item.status === "paused" ? "play" : "pause"} />{item.status === "paused" ? "Возобновить" : "На паузу"}</button> : null}</nav></footer>
          </details>;
        })}</div>
      </section>

      <section className="adminGrid" id="sync">
        <article className="adminPanel healthPanel"><header><div><span>состояние системы</span><h2>Автоматическая публикация</h2></div><span className={`healthyDot ${!initialData.connectorOnline || initialData.syncErrors || initialData.automation?.overdue || ["partial","failed"].includes(initialData.automation?.status || "") ? "hasError" : ""}`}><i />{!initialData.connectorOnline || initialData.syncErrors || initialData.automation?.overdue ? "нужна проверка" : "работает"}</span></header><div className="healthList"><div><span><i className="serviceDot" />Приложение и база</span><strong>работают</strong></div><div><span><i className="serviceDot" />Связь с Яндекс Музыкой</span><strong>{initialData.connectorOnline ? "работает" : "нет ответа"}</strong></div><div><span><i className="serviceDot" />Аккаунт followtaste</span><strong>{serviceState === "connected" ? serviceLogin || "подключён" : connectionLabels[serviceState]}</strong></div><div><span><i className="serviceDot" />Фоновый цикл</span><strong>{initialData.automation ? `${initialData.automation.status === "success" ? "успешно" : initialData.automation.status === "running" ? "выполняется" : "с ошибками"} · ${relativeTime(initialData.automation.startedAt)}` : "ещё не запускался"}</strong></div><div><span><i className="serviceDot" />Подключённые авторы</span><strong>{connectedCount} / {tastemakers.length}</strong></div><div><span><i className="serviceDot" />Последнее обновление</span><strong>{lastSyncAt ? relativeTime(lastSyncAt) : "ещё не запускалось"}</strong></div><div><span><i className="serviceDot" />Telegram</span><strong>{initialData.telegram.configured ? `${initialData.telegram.activeSubscriptions} активных` : "не подключён"}</strong></div><div><span><i className="serviceDot" />Ошибки за сутки</span><strong>{initialData.syncErrors}</strong></div></div><div className="healthActions"><button type="button" className="panelAction" onClick={() => setServiceConnectOpen(true)}><Icon name="playlist" />{serviceState === "connected" ? "Переподключить followtaste" : "Подключить followtaste"}</button>{initialData.telegram.configured ? <button type="button" className="panelAction" disabled={busy === "setup_telegram:global"} onClick={() => void action("setup_telegram")}><Icon name="send" />{busy === "setup_telegram:global" ? "Подключаем…" : "Обновить Telegram-вебхук"}</button> : null}</div></article>
        <article className="adminPanel automationPanel"><header><div><span>как работает публикация</span><h2>Без ручных действий</h2></div><Icon name="sync" /></header><ol><li><b>1</b><span>Независимые фоновые циклы проверяют историю, а открытие страницы запускает дополнительную неблокирующую проверку.</span></li><li><b>2</b><span>Мы берём только треки, которые Яндекс уже считает дослушанными до конца и добавил в историю.</span></li><li><b>3</b><span>Новая разрешённая запись попадает на страницу, в живой плейлист и — не чаще раза в день — в Telegram-сводку.</span></li></ol><p>Страница всегда открывается из сохранённых данных и не ждёт ответа Яндекса. Ошибки и запуски фиксируются отдельно.</p></article>
      </section>

      <section className="adminPanel auditPanel"><header><div><span>журнал изменений</span><h2>Последние операции</h2></div></header><div className="auditRows">{initialData.recentAudits.length ? initialData.recentAudits.slice(0, 6).map(item => <div key={item.id}><span className="auditIcon success"><Icon name="check" /></span><div><strong>{auditLabel(item.action)}</strong><small>{item.entityName || "системная операция"}</small></div><time>{relativeTime(item.createdAt)}</time><em>записано</em></div>) : <div><span className="auditIcon"><Icon name="clock" /></span><div><strong>Операций пока нет</strong><small>Журнал заполнится после первых действий.</small></div><time>—</time><em>готов</em></div>}</div></section>

      {inviteOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setInviteOpen(false); }}><section className="workspaceModal"><button type="button" onClick={() => setInviteOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span>новый автор</span><h2>Пригласить тейстмейкера</h2><label>Имя<input value={draftMaker.name} maxLength={100} onChange={event => setDraftMaker(value => ({ ...value, name: event.target.value }))} placeholder="Как будет показано публично" /></label><label>Адрес страницы<input value={draftMaker.slug} maxLength={60} onChange={event => setDraftMaker(value => ({ ...value, slug: event.target.value }))} placeholder="ivan-petrov" /></label><label>Короткая подпись<input value={draftMaker.roleLine} maxLength={120} onChange={event => setDraftMaker(value => ({ ...value, roleLine: event.target.value }))} placeholder="музыкант · режиссёр" /></label><p>Ссылка действует 7 дней и сгорает сразу после регистрации этого автора.</p><div><button type="button" className="ghostButton" onClick={() => setInviteOpen(false)}>Отмена</button><button type="button" className="darkButton" disabled={!draftMaker.name.trim() || !draftMaker.slug.trim() || busy === "create_tastemaker:global"} onClick={() => void action("create_tastemaker", undefined, draftMaker)}>{busy === "create_tastemaker:global" ? "Создаём…" : "Создать и скопировать ссылку"}</button></div></section></div> : null}
      {serviceConnectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setServiceConnectOpen(false); setServiceChallenge(null); }} aria-label="Закрыть"><Icon name="x" /></button><span>аккаунт-издатель · followtaste</span><h2>Подключить плейлисты</h2>{!serviceChallenge ? <><p>Аккаунт <b>followtaste</b> не является источником истории. Тейст создаёт и обновляет в нём публичные плейлисты всех участников.</p><div className="consentChecklist"><span><Icon name="check" />История берётся из личного аккаунта автора</span><span><Icon name="check" />followtaste только публикует плейлисты</span><span><Icon name="check" />Доступ хранится в зашифрованном виде</span></div><button className="darkButton wideButton" type="button" onClick={() => void startServiceConnection()}>{serviceState === "starting" ? "Получаем код…" : "Получить код для followtaste"}</button></> : <><p>На странице Яндекса выберите именно <b>followtaste</b>, введите код и подтвердите доступ.</p><div className="deviceCode"><small>код аккаунта followtaste</small><strong>{serviceChallenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(serviceChallenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={serviceChallenge.verificationUrl} target="_blank" rel="noreferrer">Открыть Яндекс <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения. Админку можно оставить открытой.</span></div></>}</section></div> : null}
    </>
  );
}
