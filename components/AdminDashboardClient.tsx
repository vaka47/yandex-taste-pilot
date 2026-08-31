"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icons";
import { fixtureAdminTastemakers, fixtureAnalytics } from "@/lib/fixtures";
import { fullNumber, percent, relativeTime } from "@/lib/format";
import type { AdminDashboardData, AdminTastemakerRow } from "@/lib/server/dashboard";

type Notice = { tone: "success" | "warning"; text: string } | null;
type NewTastemaker = { name: string; slug: string; roleLine: string };
type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };

const previewTastemakers: AdminTastemakerRow[] = fixtureAdminTastemakers.map(item => ({
  id: item.id, slug: item.slug, name: item.name, status: item.status,
  followerCount: item.followerCount, visitors7d: item.visitors7d, trackOpens7d: item.trackOpens7d,
  lastSyncAt: item.lastSyncAt, playlistStatus: item.playlistStatus as AdminTastemakerRow["playlistStatus"],
  connectionStatus: item.connectionStatus as AdminTastemakerRow["connectionStatus"]
}));

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    tastemaker_created: "Тейстмейкер создан", creator_invite_claimed: "Инвайт автора принят",
    connector_device_flow_started: "Подключение Яндекс Музыки начато", connector_connected: "Яндекс Музыка подключена",
    service_connector_device_flow_started: "Подключение сервисного аккаунта начато", service_connector_connected: "Сервисный аккаунт подключён",
    creator_sync_now: "История синхронизирована", creator_playlist_sync: "Live-плейлист обновлён",
    creator_pause: "Публикация поставлена на паузу", admin_paused_tastemaker: "Публикация поставлена на паузу"
  };
  return labels[action] || action.replaceAll("_", " ");
}

export function AdminDashboardClient({ preview, initialData }: { preview: boolean; initialData: AdminDashboardData | null }) {
  const [notice, setNotice] = useState<Notice>(preview ? { tone: "warning", text: "Preview использует тестовые данные. Все production-действия защищены серверной ролью admin." } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [draftMaker, setDraftMaker] = useState<NewTastemaker>({ name: "", slug: "", roleLine: "" });
  const [serviceConnectOpen, setServiceConnectOpen] = useState(false);
  const [serviceChallenge, setServiceChallenge] = useState<Challenge | null>(null);
  const [serviceState, setServiceState] = useState<"connected" | "pending" | "error" | "disconnected" | "not_connected" | "starting" | "waiting">(preview || !initialData ? "not_connected" : initialData.serviceConnection.status);
  const [serviceLogin, setServiceLogin] = useState(preview || !initialData ? null : initialData.serviceConnection.login);
  const [tastemakers, setTastemakers] = useState<AdminTastemakerRow[]>(preview || !initialData ? previewTastemakers : initialData.tastemakers);
  const metrics = preview || !initialData ? fixtureAnalytics : initialData.metrics;
  const activeCount = tastemakers.filter(item => item.status === "active").length;
  const pausedCount = tastemakers.filter(item => item.status === "paused").length;
  const invitedCount = tastemakers.filter(item => ["draft", "invited"].includes(item.status)).length;
  const connectedCount = tastemakers.filter(item => item.connectionStatus === "connected").length;
  const lastSyncAt = tastemakers.map(item => item.lastSyncAt).filter((value): value is string => Boolean(value)).sort().at(-1) || null;
  const funnel = useMemo(() => [
    { label: "Уникальные посетители", value: metrics.uniqueVisitors7d, width: 100 },
    { label: "Нажали Follow", value: metrics.followClicks7d, width: metrics.uniqueVisitors7d ? metrics.followClicks7d / metrics.uniqueVisitors7d * 100 : 0 },
    { label: "Завершили вход", value: metrics.follows7d, width: metrics.uniqueVisitors7d ? metrics.follows7d / metrics.uniqueVisitors7d * 100 : 0 },
    { label: "Подписались", value: metrics.follows7d, width: metrics.uniqueVisitors7d ? metrics.follows7d / metrics.uniqueVisitors7d * 100 : 0 }
  ], [metrics]);

  useEffect(() => {
    if (!serviceChallenge || preview || serviceState !== "waiting") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/admin/music-service/connect/status/${serviceChallenge.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string; account?: { login?: string | null }; error?: string };
      if (payload.status === "connected") {
        setServiceState("connected");
        setServiceLogin(payload.account?.login || "подключён");
        setServiceChallenge(null);
        setServiceConnectOpen(false);
        setNotice({ tone: "success", text: "Сервисный аккаунт подключён. Live-плейлисты готовы к синхронизации." });
      } else if (!response.ok && response.status !== 202) {
        setServiceState("error");
        setNotice({ tone: "warning", text: payload.error || "Не удалось подключить сервисный аккаунт." });
      }
    }, Math.max(5000, serviceChallenge.interval * 1000));
    return () => window.clearInterval(interval);
  }, [preview, serviceChallenge, serviceState]);

  async function startServiceConnection() {
    setServiceState("starting");
    if (preview) {
      setServiceChallenge({ id: "preview-service", userCode: "PLST-2026", verificationUrl: "https://oauth.yandex.ru/device", expiresAt: new Date(Date.now() + 600_000).toISOString(), interval: 5 });
      setServiceState("waiting");
      return;
    }
    const response = await fetch("/api/admin/music-service/connect/start", { method: "POST" });
    const payload = await response.json().catch(() => ({})) as Challenge & { error?: string };
    if (!response.ok) {
      setServiceState("error");
      setNotice({ tone: "warning", text: payload.error || "Не удалось начать подключение сервисного аккаунта." });
      return;
    }
    setServiceChallenge(payload);
    setServiceState("waiting");
  }

  async function action(type: string, tastemakerId?: string, payload: Partial<NewTastemaker> = {}) {
    if (preview) {
      setNotice({ tone: "warning", text: "В preview действие показано без записи. Подключите DATABASE_URL и войдите администратором, чтобы выполнить его." });
      if (type === "pause" && tastemakerId) setTastemakers(items => items.map(item => item.id === tastemakerId ? { ...item, status: item.status === "paused" ? "active" : "paused" } : item));
      if (type === "create_tastemaker") setInviteOpen(false);
      return;
    }
    setBusy(`${type}:${tastemakerId || "global"}`);
    const response = await fetch("/api/admin/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, tastemakerId, ...payload }) });
    const result = await response.json().catch(() => ({})) as { id?: string; inviteUrl?: string };
    setBusy(null);
    if (response.ok && type === "create_tastemaker" && result.inviteUrl) {
      if (result.id) setTastemakers(items => [{ id: result.id!, slug: payload.slug || "new-author", name: payload.name || "Новый автор", status: "invited", followerCount: 0, visitors7d: 0, trackOpens7d: 0, lastSyncAt: null, playlistStatus: "not_created", connectionStatus: "not_connected" }, ...items]);
      setInviteLink(result.inviteUrl);
      setInviteOpen(false);
      setDraftMaker({ name: "", slug: "", roleLine: "" });
      await navigator.clipboard?.writeText(result.inviteUrl).catch(() => undefined);
      setNotice({ tone: "success", text: "Тейстмейкер создан. Инвайт скопирован в буфер обмена." });
      return;
    }
    if (response.ok && type === "pause" && tastemakerId) setTastemakers(items => items.map(item => item.id === tastemakerId ? { ...item, status: item.status === "paused" ? "active" : "paused", playlistStatus: item.status === "paused" ? item.playlistStatus : "paused" } : item));
    setNotice(response.ok ? { tone: "success", text: "Действие выполнено и записано в audit log." } : { tone: "warning", text: "Действие не выполнено. Проверьте поля, роль и состояние подключения." });
  }

  return (
    <>
      <header className="workspaceTopbar"><div><span>операционный центр / 7 дней</span><h1>Пилот под контролем</h1></div><div>{preview ? <button type="button" className="ghostButton" onClick={() => setNotice({ tone: "warning", text: "CSV-экспорт доступен после входа администратором." })}><Icon name="arrow" />Экспорт CSV</button> : <a className="ghostButton" href="/api/admin/export?kind=daily"><Icon name="arrow" />Экспорт CSV</a>}<button type="button" className="darkButton" onClick={() => setInviteOpen(true)}><Icon name="users" />Новый тейстмейкер</button></div></header>
      {notice ? <div className={`workspaceNotice ${notice.tone}`}><Icon name={notice.tone === "success" ? "check" : "shield"} /><span>{notice.text}{inviteLink ? <> <a href={inviteLink}>Открыть инвайт</a></> : null}</span><button type="button" onClick={() => { setNotice(null); setInviteLink(null); }} aria-label="Закрыть"><Icon name="x" size={17} /></button></div> : null}

      <section className="metricStrip" aria-label="Ключевые метрики">
        <article><span>активные авторы</span><strong>{activeCount} <small>/ {tastemakers.length}</small></strong><em>{pausedCount} на паузе · {invitedCount} приглашено</em></article>
        <article><span>посетители · 7д</span><strong>{fullNumber(metrics.uniqueVisitors7d)}</strong><em className={preview ? "up" : ""}>{preview ? "↑ 22,4% к прошлой неделе" : "production · first-party"}</em></article>
        <article><span>новые подписки · 7д</span><strong>{fullNumber(metrics.follows7d)}</strong><em>{percent(metrics.follows7d, metrics.uniqueVisitors7d)} конверсия</em></article>
        <article><span>music intent · 7д</span><strong>{fullNumber(metrics.trackOpens7d)}</strong><em>{percent(metrics.trackOpens7d, metrics.uniqueVisitors7d)} открыли трек</em></article>
        <article className="metricAlert"><span>ошибки синхронизации</span><strong>{preview ? 0 : initialData?.syncErrors || 0}</strong><em>{!preview && initialData?.syncErrors ? "нужна проверка журнала" : "все контуры здоровы"}</em></article>
      </section>

      <section className="adminGrid">
        <article className="adminPanel adminTablePanel" id="tastemakers">
          <header><div><span>live operations</span><h2>Тейстмейкеры</h2></div><button type="button"><Icon name="search" />Поиск</button></header>
          <div className="adminTableWrap"><table><thead><tr><th>Автор</th><th>Статус</th><th>Подписчики</th><th>Посетители · 7д</th><th>Последний sync</th><th>Playlist</th><th /></tr></thead><tbody>{tastemakers.map(item => <tr key={item.id}><td><span className={`tableAvatar avatar-${item.slug}`}>{item.name.split(" ").map(word => word[0]).join("")}</span><div><strong>{item.name}</strong><small>/t/{item.slug}</small></div></td><td><span className={`statusTag status-${item.status}`}><i />{item.status}</span></td><td>{fullNumber(item.followerCount)}</td><td>{fullNumber(item.visitors7d)}</td><td>{item.lastSyncAt ? relativeTime(item.lastSyncAt) : "—"}</td><td><span className={`playlistState ${item.playlistStatus}`}>{item.playlistStatus.replace("_", " ")}</span></td><td><button type="button" className="rowMenu" aria-label={`Действия ${item.name}`} onClick={() => void action("pause", item.id)}>{busy === `pause:${item.id}` ? "…" : "•••"}</button></td></tr>)}</tbody></table></div>
        </article>

        <article className="adminPanel healthPanel" id="sync"><header><div><span>connector health</span><h2>Система</h2></div><span className="healthyDot"><i />healthy</span></header><div className="healthList"><div><span><i className="serviceDot" />Web + PostgreSQL</span><strong>online</strong></div><div><span><i className="serviceDot" />Music connector</span><strong>online</strong></div><div><span><i className="serviceDot" />Сервисный аккаунт</span><strong>{serviceState === "connected" ? serviceLogin || "connected" : serviceState}</strong></div><div><span><i className="serviceDot" />Подключённые авторы</span><strong>{connectedCount} / {tastemakers.length}</strong></div><div><span><i className="serviceDot" />Последний sync</span><strong>{lastSyncAt ? relativeTime(lastSyncAt) : "ещё не запускался"}</strong></div></div><div className="healthActions"><button type="button" className="panelAction" onClick={() => setServiceConnectOpen(true)}><Icon name="playlist" />{serviceState === "connected" ? "Переподключить сервис" : "Подключить сервис"}</button><button type="button" className="panelAction" disabled={!tastemakers[0]} onClick={() => tastemakers[0] && void action("sync", tastemakers[0].id)}><Icon name="sync" />Синхронизировать сейчас</button></div></article>
      </section>

      <section className="adminGrid analyticsGrid" id="analytics">
        <article className="adminPanel funnelPanel"><header><div><span>first-party funnel</span><h2>Профиль → Follow</h2></div><strong>{percent(metrics.follows7d, metrics.uniqueVisitors7d)}</strong></header><div className="funnelBars">{funnel.map((step, index) => <div key={step.label}><span>0{index + 1}</span><div><i style={{ width: `${step.width}%` }} /></div><strong>{fullNumber(step.value)}</strong><em>{step.label}</em></div>)}</div><footer><span>Follow click → completion</span><strong>{percent(metrics.follows7d, metrics.followClicks7d)}</strong></footer></article>
        <article className="adminPanel intentPanel"><header><div><span>music intent</span><h2>Открытия</h2></div><span>7 дней</span></header><div className="intentNumbers"><div><strong>{fullNumber(metrics.trackOpens7d)}</strong><span>треков</span></div><div><strong>{fullNumber(metrics.playlistOpens7d)}</strong><span>плейлиста</span></div></div><div className="miniChart" aria-label="График открытий за семь дней">{(preview ? [42, 56, 38, 64, 71, 52, 86] : [4, 4, 4, 4, 4, 4, 4]).map((value, index) => <i key={index} style={{ height: `${value}%` }}><span>{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][index]}</span></i>)}</div></article>
        <article className="adminPanel retentionPanel"><header><div><span>cohort retention</span><h2>Возвращаются</h2></div></header><div><span>D1<strong>{metrics.d1Retention.toString().replace(".", ",")}%</strong></span><span>D7<strong>{metrics.d7Retention.toString().replace(".", ",")}%</strong></span><span>D14<strong>—</strong></span></div><p>D7 = визит на 6–8 календарный день после первого просмотра.</p></article>
      </section>

      <section className="adminPanel auditPanel"><header><div><span>audit & failures</span><h2>Последние операции</h2></div><button type="button">Все журналы <Icon name="arrow" /></button></header><div className="auditRows">{preview ? <><div><span className="auditIcon success"><Icon name="sync" /></span><div><strong>История синхронизирована</strong><small>Лера Север · тестовые данные</small></div><time>3 мин назад</time><em>SUCCESS</em></div><div><span className="auditIcon"><Icon name="playlist" /></span><div><strong>Live playlist обновлён</strong><small>preview · revision 48</small></div><time>2 мин назад</time><em>SUCCESS</em></div></> : initialData?.recentAudits.length ? initialData.recentAudits.slice(0, 4).map(item => <div key={item.id}><span className="auditIcon success"><Icon name="check" /></span><div><strong>{auditLabel(item.action)}</strong><small>{item.entityName || "системная операция"}</small></div><time>{relativeTime(item.createdAt)}</time><em>RECORDED</em></div>) : <div><span className="auditIcon"><Icon name="clock" /></span><div><strong>Операций пока нет</strong><small>Журнал начнёт заполняться после действий пилота.</small></div><time>—</time><em>READY</em></div>}</div></section>

      {inviteOpen ? <div className="modalBackdrop"><section className="workspaceModal"><button type="button" onClick={() => setInviteOpen(false)}><Icon name="x" /></button><span>новый пилотный автор</span><h2>Создать тейстмейкера</h2><label>Имя<input value={draftMaker.name} onChange={event => setDraftMaker(value => ({ ...value, name: event.target.value }))} placeholder="Как будет показано публично" /></label><label>Slug<input value={draftMaker.slug} onChange={event => setDraftMaker(value => ({ ...value, slug: event.target.value }))} placeholder="taste.app/t/…" /></label><label>Роль / подпись<input value={draftMaker.roleLine} onChange={event => setDraftMaker(value => ({ ...value, roleLine: event.target.value }))} placeholder="музыкант · режиссёр" /></label><div><button type="button" className="ghostButton" onClick={() => setInviteOpen(false)}>Отмена</button><button type="button" className="darkButton" disabled={!draftMaker.name.trim() || !draftMaker.slug.trim() || busy === "create_tastemaker:global"} onClick={() => void action("create_tastemaker", undefined, draftMaker)}>Создать и выпустить инвайт</button></div></section></div> : null}
      {serviceConnectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setServiceConnectOpen(false); setServiceChallenge(null); }}><Icon name="x" /></button><span>playlist delivery · followtaste</span><h2>Аккаунт-издатель</h2>{!serviceChallenge ? <><p>Подключите технический аккаунт <b>followtaste</b>. Он не является источником истории: в нём Taste создаёт публичные live-плейлисты всех участников пилота.</p><div className="consentChecklist"><span><Icon name="check" />Источник истории — личный аккаунт каждого автора</span><span><Icon name="check" />followtaste только создаёт и обновляет плейлисты</span><span><Icon name="check" />Токен хранится только в зашифрованном виде</span></div><button className="darkButton wideButton" type="button" onClick={() => void startServiceConnection()}>{serviceState === "starting" ? "Получаем код…" : "Получить код для followtaste"}</button></> : <><p>На странице Яндекса переключитесь именно на <b>followtaste</b>, введите код и подтвердите доступ.</p><div className="deviceCode"><small>код аккаунта followtaste</small><strong>{serviceChallenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(serviceChallenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={serviceChallenge.verificationUrl} target="_blank" rel="noreferrer">Открыть страницу Яндекса <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения followtaste. Админку можно оставить открытой.</span></div></>}</section></div> : null}
    </>
  );
}
