"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { compactNumber, listeningTime, relativeTime } from "@/lib/format";
import { newMusicHeading } from "@/lib/tastemaker-copy";
import type { SessionUser, TastemakerProfile } from "@/types/domain";

function trackEvent(eventName: string, data: Record<string, unknown> = {}) {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ eventName, ...data })
  }).catch(() => undefined);
}

export function ProfileClient({ initialProfile, session }: { initialProfile: TastemakerProfile; session: SessionUser | null }) {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState(initialProfile);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"follow" | "telegram">("follow");
  const [playlistPromptOpen, setPlaylistPromptOpen] = useState(searchParams.get("follow") === "completed" && searchParams.get("telegram") !== "connect" && !profile.telegram.subscribed);
  const [unfollowConfirmOpen, setUnfollowConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "neutral"; text: string } | null>(null);
  const [mobileActionVisible, setMobileActionVisible] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [telegramState, setTelegramState] = useState(profile.telegram);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const primaryFollowRef = useRef<HTMLButtonElement>(null);
  const autoTelegramRef = useRef(false);

  const onRepeat = useMemo(() => {
    const unique = new Map<string, (typeof profile.events)[number]>();
    for (const event of profile.events) {
      if (event.playCount7d < 2) continue;
      const current = unique.get(event.track.id);
      if (!current || event.consecutiveCount > current.consecutiveCount) unique.set(event.track.id, event);
    }
    return [...unique.values()].sort((a, b) => b.playCount7d - a.playCount7d || b.consecutiveCount - a.consecutiveCount).slice(0, 20);
  }, [profile.events]);
  const firstSeen = useMemo(() => [...profile.events].sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()).slice(0, 4), [profile.events]);

  useEffect(() => {
    trackEvent("tastemaker_profile_view", { tastemakerId: profile.id, properties: { access: profile.historyAccess, authenticated: Boolean(session) } });
    if (profile.historyAccess === "full") trackEvent("history_unlocked_view", { tastemakerId: profile.id });
  }, [profile.id, profile.historyAccess, session]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!shareCopied) return;
    const timer = window.setTimeout(() => setShareCopied(false), 2600);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  useEffect(() => {
    const button = primaryFollowRef.current;
    const footer = document.querySelector(".publicFooter");
    if (!button) return;
    const actionObserver = new IntersectionObserver(([entry]) => setMobileActionVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: .15 });
    const footerObserver = footer ? new IntersectionObserver(([entry]) => setFooterVisible(entry.isIntersecting), { threshold: .05 }) : null;
    actionObserver.observe(button);
    if (footer && footerObserver) footerObserver.observe(footer);
    return () => { actionObserver.disconnect(); footerObserver?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!telegramBusy) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/telegram/link?tastemakerId=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const state = await response.json() as typeof telegramState;
      setTelegramState(state);
      if (state.subscribed) {
        setTelegramBusy(false);
        setToast({ tone: "success", text: `Уведомления о ${profile.name} включены.` });
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [telegramBusy, profile.id, profile.name]);

  useEffect(() => {
    if (!session || searchParams.get("telegram") !== "connect" || autoTelegramRef.current || !telegramState.available) return;
    autoTelegramRef.current = true;
    void connectTelegram();
  }, [session, telegramState.available]);

  async function setFollowing(following: boolean, showPlaylist = true) {
    const response = await fetch(`/api/tastemakers/${profile.id}/follow`, { method: following ? "POST" : "DELETE" });
    if (!response.ok) return false;
    const payload = await response.json() as { following: boolean; followerCount: number };
    setProfile(current => ({ ...current, viewerFollows: payload.following, followerCount: payload.followerCount }));
    if (payload.following && showPlaylist) setPlaylistPromptOpen(true);
    if (!payload.following) setTelegramState(current => ({ ...current, subscribed: false }));
    return true;
  }

  async function follow() {
    trackEvent("follow_click", { tastemakerId: profile.id });
    if (!session) {
      setAuthIntent("follow");
      setAuthOpen(true);
      return;
    }
    if (profile.viewerFollows) {
      setUnfollowConfirmOpen(true);
      return;
    }
    const ok = await setFollowing(true);
    if (!ok) setToast({ tone: "error", text: "Не удалось изменить подписку. Попробуйте ещё раз." });
    else setToast(null);
  }

  async function confirmUnfollow() {
    const ok = await setFollowing(false, false);
    setUnfollowConfirmOpen(false);
    setToast(ok ? { tone: "neutral", text: "Подписка отменена." } : { tone: "error", text: "Не удалось отменить подписку. Попробуйте ещё раз." });
  }

  async function share() {
    trackEvent("share_click", { tastemakerId: profile.id });
    const profileUrl = `${window.location.origin}/t/${profile.slug}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(profileUrl);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = profileUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("COPY_FAILED");
      }
      setShareCopied(true);
      setToast({ tone: "success", text: "Ссылка на страницу скопирована." });
    } catch {
      setToast({ tone: "error", text: "Не удалось скопировать ссылку." });
    }
  }

  async function connectTelegram() {
    if (!telegramState.available) {
      setToast({ tone: "neutral", text: "Telegram-уведомления скоро станут доступны." });
      return;
    }
    if (!session) {
      setAuthIntent("telegram");
      setAuthOpen(true);
      return;
    }
    const telegramTab = telegramState.connected ? null : window.open("about:blank", "_blank");
    if (telegramTab) {
      telegramTab.opener = null;
      telegramTab.document.title = "Открываем Telegram…";
      telegramTab.document.body.textContent = "Открываем Telegram…";
    }
    setTelegramBusy(true);
    if (!profile.viewerFollows) {
      const followed = await setFollowing(true, false);
      if (!followed) {
        telegramTab?.close();
        setTelegramBusy(false);
        setToast({ tone: "error", text: "Не удалось оформить подписку перед подключением Telegram." });
        return;
      }
    }
    trackEvent("telegram_connect_click", { tastemakerId: profile.id });
    const response = await fetch("/api/telegram/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tastemakerId: profile.id }) });
    const payload = await response.json().catch(() => ({})) as { url?: string; subscribed?: boolean; connected?: boolean };
    if (!response.ok || (!payload.url && !payload.subscribed)) {
      telegramTab?.close();
      setTelegramBusy(false);
      setToast({ tone: "error", text: "Не удалось открыть Telegram. Попробуйте ещё раз." });
      return;
    }
    if (payload.subscribed) {
      setTelegramState({ available: true, connected: true, subscribed: true });
      setTelegramBusy(false);
      setPlaylistPromptOpen(false);
      setToast({ tone: "success", text: `Уведомления о ${profile.name} включены.` });
      return;
    }
    const telegramUrl = payload.url;
    if (!telegramUrl) {
      telegramTab?.close();
      setTelegramBusy(false);
      setToast({ tone: "error", text: "Не удалось открыть Telegram. Попробуйте ещё раз." });
      return;
    }
    setToast({ tone: "neutral", text: "В Telegram нажмите «Запустить» — подписка включится автоматически." });
    if (telegramTab) {
      telegramTab.location.replace(telegramUrl);
      telegramTab.focus();
    } else {
      const opened = window.open(telegramUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(telegramUrl);
    }
  }

  async function disconnectTelegram() {
    setTelegramBusy(true);
    const response = await fetch("/api/telegram/link", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ tastemakerId: profile.id }) });
    setTelegramBusy(false);
    if (!response.ok) return setToast({ tone: "error", text: "Не удалось отключить уведомления." });
    setTelegramState(current => ({ ...current, subscribed: false }));
    trackEvent("telegram_disconnected", { tastemakerId: profile.id });
    setToast({ tone: "neutral", text: `Уведомления о ${profile.name} отключены.` });
  }

  const authReturnTo = authIntent === "telegram" ? `/t/${profile.slug}?telegram=connect` : `/t/${profile.slug}`;
  const authHref = `/auth/yandex/start?returnTo=${encodeURIComponent(authReturnTo)}&follow=${encodeURIComponent(profile.id)}`;
  const unlockHref = `/auth/yandex/start?returnTo=${encodeURIComponent(`/t/${profile.slug}`)}&tastemaker=${encodeURIComponent(profile.id)}`;

  return (
    <>
      <main className="profilePage">
        <section className="profileHero">
          <div className="portraitStage">
            <ProfilePortrait name={profile.name} avatarUrl={profile.avatarUrl} />
            {profile.events[0] ? <a className="nowTape" href={`/go/track/${profile.events[0].id}?source=hero_tape&position=1`} target="_blank" rel="noreferrer" aria-label={`Открыть ${profile.events[0].track.title} в Яндекс Музыке`}>
              <span className="liveDot" />
              <div><small>{profile.events[0] ? `последняя запись · ${listeningTime(profile.events[0])}` : "ждём первую запись"}</small><strong>{profile.events[0]?.track.title || "История скоро появится"}</strong><em>{profile.events[0]?.track.artists.join(", ") || "Taste обновит страницу автоматически"}</em></div>
              <CoverArt url={profile.events[0].track.coverUrl} title={profile.events[0].track.title} size="small" />
            </a> : <div className="nowTape nowTapeEmpty"><span className="liveDot" /><div><small>ждём первую запись</small><strong>История скоро появится</strong><em>Taste обновит страницу автоматически</em></div><Icon name="music" /></div>}
          </div>

          <div className="heroCopy">
            <div className="eyebrowRow"><span className="eyebrow"><i />{profile.lastSyncAt ? `обновлено ${relativeTime(profile.lastSyncAt)}` : "история включена"}</span></div>
            <h1>Что слушает<br /><span>{profile.name}</span></h1>
            {profile.roleLine || profile.verified ? <div className="identityLine">{profile.roleLine ? <strong>{profile.roleLine}</strong> : null}{profile.verified ? <i className="verified"><Icon name="check" size={12} /></i> : null}</div> : null}
            {profile.bio ? <p>{profile.bio}</p> : null}
            <div className={`heroActions ${!session ? "anonymousActions" : ""}`}>
              <button ref={primaryFollowRef} className={`primaryAction ${profile.viewerFollows ? "isFollowing" : ""}`} type="button" onClick={() => void follow()}><Icon name={profile.viewerFollows ? "check" : "pulse"} />{profile.viewerFollows ? "Вы подписаны" : "Подписаться"}</button>
              {profile.viewerFollows && profile.playlistUrl ? <a className="playlistAction" href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" /> Плейлист в Яндекс Музыке <Icon name="arrow" size={17} /></a> : null}
              {!telegramState.subscribed ? <button className="heroTelegramAction" type="button" disabled={telegramBusy || !telegramState.available} onClick={() => void connectTelegram()}><Icon name="send" /><span>{telegramBusy ? "Подключаем Telegram…" : "Получать обновления в Telegram"}</span><Icon name="arrow" size={17} /></button> : null}
            </div>
            <div className="heroTrust"><Icon name="shield" size={18} /><span>История публикуется с разрешения Саундмейкера.</span></div>
          </div>
        </section>

        <section className="profileStats" aria-label="Статистика профиля">
          <div><strong>{compactNumber(profile.followerCount)}</strong><span>подписчиков</span></div>
          <div><strong>{profile.totalEventCount30d}</strong><span>прослушиваний за 30 дней</span></div>
          <div><strong>{profile.playlistTrackCount}</strong><span>треков в плейлисте</span></div>
          <button type="button" onClick={() => void share()}><Icon name={shareCopied ? "check" : "share"} /><span>{shareCopied ? "Ссылка скопирована" : "Поделиться"}</span></button>
        </section>

        <section className="listeningSection">
          <header className="sectionHeader"><div><span>последние обновления</span><h2>История прослушиваний</h2></div><p>Нажмите на трек, чтобы открыть его в Яндекс Музыке.</p></header>
          <div className={`eventList ${profile.historyAccess === "full" ? "eventListScrollable" : ""}`} tabIndex={profile.historyAccess === "full" ? 0 : undefined} aria-label={profile.historyAccess === "full" ? "Последние шесть прослушиваний. Список прокручивается." : undefined}>
            {(profile.historyAccess === "teaser" ? profile.events.slice(0, 1) : profile.events).map((event, index) => (
              <a className={`eventRow ${event.track.coverUrl ? "" : "noArtwork"}`} key={event.id} href={`/go/track/${event.id}?source=recent&position=${index + 1}`} target="_blank" rel="noreferrer" aria-label={`Открыть ${event.track.title} в Яндекс Музыке`}>
                <span className="eventIndex">{String(index + 1).padStart(2, "0")}</span>
                <span className="eventArtwork"><CoverArt url={event.track.coverUrl} title={event.track.title} /></span>
                <div className="eventTrack"><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span>{event.comment ? <blockquote><Icon name="spark" size={14} /><span>«{event.comment.body}»</span></blockquote> : null}</div>
                <div className="eventSignal"><i /><span>{index === 0 ? "сейчас в истории" : event.playCount7d > 2 ? "возвращается к треку" : "прослушано"}</span></div>
                <time>{listeningTime(event)}</time>
                <span className="trackOpen"><span>Открыть</span><Icon name="arrow" /></span>
              </a>
            ))}
            {profile.historyAccess === "teaser" && profile.events.length ? [2, 3].map(index => <div className="eventRow lockedEventRow" key={`locked-${index}`} aria-hidden="true"><span className="eventIndex">{String(index).padStart(2, "0")}</span><span className="lockedCover"><Icon name="lock" /></span><div className="eventTrack"><strong>Скрытый трек</strong><span>Имя исполнителя</span></div><div className="eventSignal"><i /><span>после входа</span></div><time>—</time><span className="lockedOpen"><Icon name="lock" size={13} />Закрыто</span></div>) : null}
            {!profile.events.length ? <div className="sectionEmpty"><Icon name="music" /><strong>История пока пуста</strong><span>Первая запись появится после следующего прослушивания и синхронизации.</span></div> : null}
          </div>
        </section>

        {profile.historyAccess === "teaser" ? <section className="historyUnlockSection"><div className="unlockIntro"><div className="unlockSignal" aria-hidden="true"><i /><i /><i /><i /></div><span>продолжение после входа</span></div><h2>Последний трек уже здесь. Остальное откроется вам после входа</h2><p>Войдите через Яндекс ID, чтобы увидеть всю историю, повторы и комментарии Саундмейкера. Taste не получает доступ к вашей музыке.</p><div className="unlockBenefits"><span><Icon name="music" />Полная история</span><span><Icon name="pulse" />Повторы за 7 дней</span><span><Icon name="spark" />Комментарии Саундмейкера</span></div><Link className="historyUnlockAction" href={unlockHref} onClick={() => trackEvent("history_unlock_click", { tastemakerId: profile.id })}><span>Я</span>Войти и продолжить <Icon name="arrow" /></Link></section> : <>
          <section className="repeatSection">
            <header className="sectionHeader sectionHeaderLight"><div><span>возвращается снова</span><h2>На повторе</h2></div><p>Треки, которые встречались в истории несколько раз за 7 дней.</p></header>
          <div className="repeatGrid" aria-label="Треки на повторе">{onRepeat.length ? onRepeat.map((event, index) => <a href={`/go/track/${event.id}?source=on_repeat&position=${index + 1}`} target="_blank" rel="noreferrer" className={`repeatItem ${event.track.coverUrl ? "" : "noArtwork"}`} key={event.id}><CoverArt url={event.track.coverUrl} title={event.track.title} size="large" /><span className="repeatRank">{String(index + 1).padStart(2, "0")}</span><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span><em>{event.consecutiveCount >= 2 ? `${event.consecutiveCount} подряд · ${event.playCount7d} за 7 дней` : `${event.playCount7d} раза за 7 дней`}</em></a>) : <div className="sectionEmpty"><Icon name="pulse" /><strong>Повторы ещё не накопились</strong><span>Они появятся, когда Саундмейкер вернётся к одному треку несколько раз.</span></div>}</div>
          </section>
          <section className="firstSeenSection">
            <header className="sectionHeader"><div><span>впервые в истории</span><h2>{newMusicHeading(profile.name, profile.gender)}</h2></div></header>
            <div className="firstSeenList">{firstSeen.length ? firstSeen.map((event, index) => <a className={event.track.coverUrl ? "" : "noArtwork"} href={`/go/track/${event.id}?source=new&position=${index + 1}`} target="_blank" rel="noreferrer" key={event.id}><span>{String(index + 1).padStart(2, "0")}</span><span className="eventArtwork"><CoverArt url={event.track.coverUrl} title={event.track.title} size="small" /></span><div><strong>{event.track.title}</strong><small>{event.track.artists.join(", ")}</small></div><em>впервые {relativeTime(event.firstSeenAt)}</em><Icon name="arrow" /></a>) : null}</div>
          </section>
        </>}

        <section className={`telegramInvite ${telegramState.subscribed ? "isActive" : ""}`}>
          <span className="telegramInviteIcon"><Icon name="send" /></span>
          <div><small>обновления без лишнего шума</small><h2>{telegramState.subscribed ? `Вы получаете новости о ${profile.name}` : "Узнавайте о новой музыке в Telegram"}</h2><p>{telegramState.subscribed ? "Дневная сводка придёт в вашем персональном слоте с 12:00 до 21:00 по Москве, а комментарии Саундмейкера — сразу." : `Taste назначит отдельный дневной слот с 12:00 до 21:00 по Москве и пришлёт одну сводку, если ${profile.name} слушал новую музыку. Комментарии приходят сразу.`}</p></div>
          <button type="button" disabled={telegramBusy || (!telegramState.available && !telegramState.subscribed)} onClick={() => void (telegramState.subscribed ? disconnectTelegram() : connectTelegram())}>{telegramBusy ? "Подключаем…" : telegramState.subscribed ? "Отключить" : telegramState.available ? "Получать уведомления" : "Скоро"}<Icon name="arrow" /></button>
        </section>
      </main>

      {mobileActionVisible && !footerVisible ? <div className={`mobileActions ${profile.viewerFollows && profile.playlistUrl ? "withPlaylist" : "single"}`}><button type="button" onClick={() => void follow()}><Icon name={profile.viewerFollows ? "check" : "pulse"} />{profile.viewerFollows ? "Вы подписаны" : "Подписаться"}</button>{profile.viewerFollows && profile.playlistUrl ? <a href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" />Плейлист</a> : null}</div> : null}

      {playlistPromptOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setPlaylistPromptOpen(false); }}><section className="authModal playlistPrompt" role="dialog" aria-modal="true" aria-labelledby="playlist-prompt-title"><button className="modalClose" type="button" onClick={() => setPlaylistPromptOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><div className="playlistPromptStatus"><span className="modalSignal"><i /><i /><i /></span><small>подписка оформлена</small></div><h2 id="playlist-prompt-title">Откройте историю прослушиваний вашего Саундмейкера в Яндекс Музыке</h2><p>Когда ваш кумир слушает новый трек, он автоматически появляется по этой постоянной ссылке. Нажмите на сердце в Яндекс Музыке, чтобы сохранить плейлист и не потерять его.{!telegramState.subscribed ? " Подключите Telegram, чтобы не пропустить новую музыку, которую сегодня послушал ваш Саундмейкер." : ""}</p>{profile.playlistUrl ? <a className="yandexLogin" href={`/go/playlist/${profile.id}?source=follow_success`} target="_blank" rel="noreferrer" onClick={() => setPlaylistPromptOpen(false)}><span>Я</span>Открыть в Яндекс Музыке<Icon name="arrow" /></a> : <button className="yandexLogin playlistPreparing" type="button" disabled><span>Я</span>Плейлист создаётся<Icon name="clock" /></button>}{!telegramState.subscribed ? <button className="telegramPromptAction" type="button" disabled={!telegramState.available || telegramBusy} onClick={() => void connectTelegram()}><Icon name="send" />{telegramBusy ? "Подключаем…" : telegramState.available ? "Получать обновления в Telegram" : "Telegram скоро подключим"}</button> : null}<button className="playlistPromptLater" type="button" onClick={() => setPlaylistPromptOpen(false)}>Вернуться в Taste</button></section></div> : null}

      {unfollowConfirmOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setUnfollowConfirmOpen(false); }}><section className="authModal unfollowConfirm" role="alertdialog" aria-modal="true" aria-labelledby="unfollow-title"><button className="modalClose" type="button" onClick={() => setUnfollowConfirmOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span className="confirmModalIcon"><Icon name="pulse" /></span><h2 id="unfollow-title">Отписаться от {profile.name}?</h2><p>История исчезнет из ваших подписок, а Telegram-уведомления об этом Саундмейкере отключатся.</p><div><button type="button" className="playlistPromptLater" onClick={() => setUnfollowConfirmOpen(false)}>Остаться</button><button type="button" className="dangerButton" onClick={() => void confirmUnfollow()}>Отписаться</button></div></section></div> : null}

      {authOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setAuthOpen(false); }}><section className="authModal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modalClose" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span className="modalSignal"><i /><i /><i /></span><small>без доступа к вашей музыке</small><h2 id="auth-title">{authIntent === "telegram" ? `Получать обновления о ${profile.name}` : `Подписаться на ${profile.name}`}</h2><p>Яндекс ID нужен только для вашей учётной записи Taste. После входа подписка оформится автоматически.</p><Link className="yandexLogin" href={authHref}><span>Я</span>Продолжить с Яндекс ID<Icon name="arrow" /></Link></section></div> : null}

      {toast ? <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><Icon name={toast.tone === "error" ? "shield" : toast.tone === "success" ? "check" : "pulse"} />{toast.text}</div> : null}
    </>
  );
}
