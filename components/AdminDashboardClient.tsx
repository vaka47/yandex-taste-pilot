"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icons";
import { fixtureAdminTastemakers, fixtureAnalytics } from "@/lib/fixtures";
import { fullNumber, percent, relativeTime } from "@/lib/format";

type Notice = { tone: "success" | "warning"; text: string } | null;

export function AdminDashboardClient({ preview }: { preview: boolean }) {
  const [notice, setNotice] = useState<Notice>(preview ? { tone: "warning", text: "Preview использует тестовые данные. Все production-действия защищены серверной ролью admin." } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tastemakers, setTastemakers] = useState(fixtureAdminTastemakers);
  const metrics = fixtureAnalytics;
  const funnel = useMemo(() => [
    { label: "Уникальные посетители", value: metrics.uniqueVisitors7d, width: 100 },
    { label: "Нажали Follow", value: metrics.followClicks7d, width: metrics.followClicks7d / metrics.uniqueVisitors7d * 100 },
    { label: "Завершили вход", value: 6472, width: 6472 / metrics.uniqueVisitors7d * 100 },
    { label: "Подписались", value: metrics.follows7d, width: metrics.follows7d / metrics.uniqueVisitors7d * 100 }
  ], [metrics]);

  async function action(type: string, tastemakerId?: string) {
    if (preview) {
      setNotice({ tone: "warning", text: "В preview действие показано без записи. Подключите DATABASE_URL и войдите администратором, чтобы выполнить его." });
      if (type === "pause" && tastemakerId) setTastemakers(items => items.map(item => item.id === tastemakerId ? { ...item, status: item.status === "paused" ? "active" : "paused" } : item));
      return;
    }
    setBusy(`${type}:${tastemakerId || "global"}`);
    const response = await fetch("/api/admin/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, tastemakerId }) });
    setBusy(null);
    setNotice(response.ok ? { tone: "success", text: "Действие выполнено и записано в audit log." } : { tone: "warning", text: "Действие не выполнено. Проверьте роль и состояние подключения." });
  }

  return (
    <>
      <header className="workspaceTopbar"><div><span>операционный центр / 7 дней</span><h1>Пилот под контролем</h1></div><div>{preview ? <button type="button" className="ghostButton" onClick={() => setNotice({ tone: "warning", text: "CSV-экспорт доступен после входа администратором." })}><Icon name="arrow" />Экспорт CSV</button> : <a className="ghostButton" href="/api/admin/export?kind=daily"><Icon name="arrow" />Экспорт CSV</a>}<button type="button" className="darkButton" onClick={() => setInviteOpen(true)}><Icon name="users" />Новый тейстмейкер</button></div></header>
      {notice ? <div className={`workspaceNotice ${notice.tone}`}><Icon name={notice.tone === "success" ? "check" : "shield"} /><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Закрыть"><Icon name="x" size={17} /></button></div> : null}

      <section className="metricStrip" aria-label="Ключевые метрики">
        <article><span>активные авторы</span><strong>1 <small>/ 3</small></strong><em>1 на паузе · 1 приглашён</em></article>
        <article><span>посетители · 7д</span><strong>{fullNumber(metrics.uniqueVisitors7d)}</strong><em className="up">↑ 22,4% к прошлой неделе</em></article>
        <article><span>новые подписки · 7д</span><strong>{fullNumber(metrics.follows7d)}</strong><em>{percent(metrics.follows7d, metrics.uniqueVisitors7d)} конверсия</em></article>
        <article><span>music intent · 7д</span><strong>{fullNumber(metrics.trackOpens7d)}</strong><em>{percent(metrics.trackOpens7d, metrics.uniqueVisitors7d)} открыли трек</em></article>
        <article className="metricAlert"><span>ошибки синхронизации</span><strong>0</strong><em>все контуры здоровы</em></article>
      </section>

      <section className="adminGrid">
        <article className="adminPanel adminTablePanel">
          <header><div><span>live operations</span><h2>Тейстмейкеры</h2></div><button type="button"><Icon name="search" />Поиск</button></header>
          <div className="adminTableWrap"><table><thead><tr><th>Автор</th><th>Статус</th><th>Подписчики</th><th>Посетители · 7д</th><th>Последний sync</th><th>Playlist</th><th /></tr></thead><tbody>{tastemakers.map(item => <tr key={item.id}><td><span className={`tableAvatar avatar-${item.slug}`}>{item.name.split(" ").map(word => word[0]).join("")}</span><div><strong>{item.name}</strong><small>/t/{item.slug}</small></div></td><td><span className={`statusTag status-${item.status}`}><i />{item.status}</span></td><td>{fullNumber(item.followerCount)}</td><td>{fullNumber(item.visitors7d)}</td><td>{item.lastSyncAt ? relativeTime(item.lastSyncAt) : "—"}</td><td><span className={`playlistState ${item.playlistStatus}`}>{item.playlistStatus.replace("_", " ")}</span></td><td><button type="button" className="rowMenu" aria-label={`Действия ${item.name}`} onClick={() => void action("pause", item.id)}>{busy === `pause:${item.id}` ? "…" : "•••"}</button></td></tr>)}</tbody></table></div>
        </article>

        <article className="adminPanel healthPanel" id="sync"><header><div><span>connector health</span><h2>Система</h2></div><span className="healthyDot"><i />healthy</span></header><div className="healthList"><div><span><i className="serviceDot" />Web + PostgreSQL</span><strong>38 ms</strong></div><div><span><i className="serviceDot" />Music connector</span><strong>v3.0.0</strong></div><div><span><i className="serviceDot" />История Леры</span><strong>3 мин</strong></div><div><span><i className="serviceDot" />Live playlist</span><strong>47 / 50</strong></div></div><button type="button" className="panelAction" onClick={() => void action("sync", tastemakers[0].id)}><Icon name="sync" />Синхронизировать сейчас</button></article>
      </section>

      <section className="adminGrid analyticsGrid" id="analytics">
        <article className="adminPanel funnelPanel"><header><div><span>first-party funnel</span><h2>Профиль → Follow</h2></div><strong>{percent(metrics.follows7d, metrics.uniqueVisitors7d)}</strong></header><div className="funnelBars">{funnel.map((step, index) => <div key={step.label}><span>0{index + 1}</span><div><i style={{ width: `${step.width}%` }} /></div><strong>{fullNumber(step.value)}</strong><em>{step.label}</em></div>)}</div><footer><span>Follow click → completion</span><strong>{percent(metrics.follows7d, metrics.followClicks7d)}</strong></footer></article>
        <article className="adminPanel intentPanel"><header><div><span>music intent</span><h2>Открытия</h2></div><span>7 дней</span></header><div className="intentNumbers"><div><strong>{fullNumber(metrics.trackOpens7d)}</strong><span>треков</span></div><div><strong>{fullNumber(metrics.playlistOpens7d)}</strong><span>плейлиста</span></div></div><div className="miniChart" aria-label="График открытий за семь дней">{[42, 56, 38, 64, 71, 52, 86].map((value, index) => <i key={index} style={{ height: `${value}%` }}><span>{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][index]}</span></i>)}</div></article>
        <article className="adminPanel retentionPanel"><header><div><span>cohort retention</span><h2>Возвращаются</h2></div></header><div><span>D1<strong>{metrics.d1Retention.toString().replace(".", ",")}%</strong></span><span>D7<strong>{metrics.d7Retention.toString().replace(".", ",")}%</strong></span><span>D14<strong>—</strong></span></div><p>D7 = визит на 6–8 календарный день после первого просмотра.</p></article>
      </section>

      <section className="adminPanel auditPanel"><header><div><span>audit & failures</span><h2>Последние операции</h2></div><button type="button">Все журналы <Icon name="arrow" /></button></header><div className="auditRows"><div><span className="auditIcon success"><Icon name="sync" /></span><div><strong>История синхронизирована</strong><small>Лера Север · fetched 8 · inserted 2</small></div><time>3 мин назад</time><em>SUCCESS</em></div><div><span className="auditIcon"><Icon name="playlist" /></span><div><strong>Live playlist обновлён</strong><small>2 insert · 1 reorder · revision 48</small></div><time>2 мин назад</time><em>SUCCESS</em></div><div><span className="auditIcon privacy"><Icon name="pause" /></span><div><strong>Публикация поставлена на паузу</strong><small>Макс Волна · действие автора</small></div><time>вчера</time><em>PRIVACY</em></div></div></section>

      {inviteOpen ? <div className="modalBackdrop"><section className="workspaceModal"><button type="button" onClick={() => setInviteOpen(false)}><Icon name="x" /></button><span>новый пилотный автор</span><h2>Создать тейстмейкера</h2><label>Имя<input defaultValue="" placeholder="Как будет показано публично" /></label><label>Slug<input defaultValue="" placeholder="taste.app/t/…" /></label><label>Роль / подпись<input defaultValue="" placeholder="музыкант · режиссёр" /></label><div><button type="button" className="ghostButton" onClick={() => setInviteOpen(false)}>Отмена</button><button type="button" className="darkButton" onClick={() => { setInviteOpen(false); void action("create_tastemaker"); }}>Создать и выпустить инвайт</button></div></section></div> : null}
    </>
  );
}
