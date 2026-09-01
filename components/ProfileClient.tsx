"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { compactNumber, listeningTime, relativeTime } from "@/lib/format";
import type { SessionUser, TastemakerProfile } from "@/types/domain";

function trackEvent(eventName: string, data: Record<string, unknown> = {}) {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ eventName, ...data })
  }).catch(() => undefined);
}

export function ProfileClient({ initialProfile, session, ownerView = false }: { initialProfile: TastemakerProfile; session: SessionUser | null; ownerView?: boolean }) {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState(initialProfile);
  const [authOpen, setAuthOpen] = useState(false);
  const [playlistPromptOpen, setPlaylistPromptOpen] = useState(searchParams.get("follow") === "completed");
  const [toast, setToast] = useState<{ tone: "success" | "error" | "neutral"; text: string } | null>(null);
  const [mobileActionVisible, setMobileActionVisible] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [telegramState, setTelegramState] = useState(profile.telegram);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const primaryFollowRef = useRef<HTMLButtonElement>(null);
  const onRepeat = useMemo(() => {
    const unique = new Map<string, (typeof profile.events)[number]>();
    for (const event of profile.events) {
      if (event.playCount7d < 2) continue;
      const current = unique.get(event.track.id);
      if (!current || event.consecutiveCount > current.consecutiveCount) unique.set(event.track.id, event);
    }
    return [...unique.values()].sort((a, b) => b.playCount7d - a.playCount7d || b.consecutiveCount - a.consecutiveCount).slice(0, 4);
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
    const button = primaryFollowRef.current;
    const footer = document.querySelector(".publicFooter");
    if (!button) return;
    const actionObserver = new IntersectionObserver(([entry]) => {
      setMobileActionVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, { threshold: .15 });
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
        setToast({ tone: "success", text: "Telegram подключён. Уведомления будут приходить не чаще раза в день." });
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [telegramBusy, profile.id]);

  async function follow() {
    trackEvent("follow_click", { tastemakerId: profile.id });
    if (!session) {
      setAuthOpen(true);
      return;
    }
    const response = await fetch(`/api/tastemakers/${profile.id}/follow`, { method: profile.viewerFollows ? "DELETE" : "POST" });
    if (!response.ok) {
      setToast({ tone: "error", text: "Не удалось изменить подписку. Изменения не применены — попробуйте ещё раз." });
      return;
    }
    const payload = await response.json() as { following: boolean; followerCount: number };
    setProfile(current => ({ ...current, viewerFollows: payload.following, followerCount: payload.followerCount }));
    if (payload.following) {
      setToast(null);
      setPlaylistPromptOpen(true);
    } else {
      setTelegramState(current => ({ ...current, subscribed: false }));
      setToast({ tone: "neutral", text: "Подписка отменена." });
    }
  }

  async function share() {
    trackEvent("share_click", { tastemakerId: profile.id });
    const shareData = { title: `Что слушает ${profile.name}`, text: `История музыкального вкуса ${profile.name} в Тейсте`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(error => {
      if ((error as DOMException)?.name !== "AbortError") setToast({ tone: "error", text: "Не удалось открыть меню отправки. Попробуйте ещё раз." });
    });
    else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setToast({ tone: "success", text: "Ссылка скопирована." });
      } catch {
        setToast({ tone: "error", text: "Не удалось скопировать ссылку. Разрешите доступ к буферу обмена и повторите." });
      }
    }
  }

  function unlockHistory() {
    trackEvent("history_unlock_click", { tastemakerId: profile.id });
  }

  async function connectTelegram() {
    if (!session) { setAuthOpen(true); return; }
    if (!profile.viewerFollows) {
      setToast({ tone: "neutral", text: "Сначала подпишитесь на автора в Тейсте — затем включите уведомления." });
      return;
    }
    setTelegramBusy(true);
    trackEvent("telegram_connect_click", { tastemakerId: profile.id });
    const response = await fetch("/api/telegram/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tastemakerId: profile.id }) });
    const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !payload.url) {
      setTelegramBusy(false);
      setToast({ tone: "error", text: payload.error === "FOLLOW_REQUIRED" ? "Сначала подпишитесь на автора в Тейсте." : "Не удалось открыть Telegram. Попробуйте ещё раз." });
      return;
    }
    setToast({ tone: "neutral", text: "В Telegram нажмите «Запустить». После подтверждения уведомления включатся автоматически." });
    window.location.assign(payload.url);
  }

  async function disconnectTelegram() {
    setTelegramBusy(true);
    const response = await fetch("/api/telegram/link", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ tastemakerId: profile.id }) });
    setTelegramBusy(false);
    if (!response.ok) {
      setToast({ tone: "error", text: "Не удалось отключить уведомления. Попробуйте ещё раз." });
      return;
    }
    setTelegramState(current => ({ ...current, subscribed: false }));
    trackEvent("telegram_disconnected", { tastemakerId: profile.id });
    setToast({ tone: "neutral", text: "Уведомления об этом авторе отключены." });
  }

  const authHref = `/auth/yandex/start?returnTo=${encodeURIComponent(`/t/${profile.slug}`)}&follow=${encodeURIComponent(profile.id)}`;
  const unlockHref = `/auth/yandex/start?returnTo=${encodeURIComponent(`/t/${profile.slug}`)}&tastemaker=${encodeURIComponent(profile.id)}`;

  return (
    <>
      <main className="profilePage">
        <section className="profileHero">
          <div className="portraitStage">
            <div className="portraitMeta"><span>сигнал вкуса</span><b>01—{new Date().getFullYear()}</b></div>
            <ProfilePortrait name={profile.name} avatarUrl={profile.avatarUrl} />
            {ownerView && profile.avatarUrl ? <aside className="ownerPhotoTools"><span><Icon name="shield" />Только для владельца</span><a href={`${profile.avatarUrl}${profile.avatarUrl.includes("?") ? "&" : "?"}download=1`}><Icon name="arrow" />Скачать для обложки</a></aside> : null}
            <div className="nowTape">
              <span className="liveDot" />
              {profile.historyAccess === "full" ? <div><small>{profile.events[0] ? `последняя запись · ${listeningTime(profile.events[0])}` : "ждём первую запись"}</small><strong>{profile.events[0]?.track.title || "История скоро появится"}</strong><em>{profile.events[0]?.track.artists.join(", ") || "Тейст обновит страницу автоматически"}</em></div> : <div><small>живая история защищена</small><strong>Свежая музыка уже внутри</strong><em>Войдите, чтобы увидеть треки</em></div>}
              <span className="tapeBars" aria-hidden="true">▂▅▃▇▆▂</span>
            </div>
          </div>

          <div className="heroCopy">
            <div className="eyebrowRow">
              <span className="eyebrow"><i /> история включена</span>
              {profile.fixture ? <span className="fixtureFlag">тестовые данные</span> : null}
            </div>
            <h1>Что слушает<br /><span>{profile.name}</span></h1>
            <div className="identityLine"><strong>{profile.roleLine}</strong>{profile.verified ? <i className="verified"><Icon name="check" size={12} /></i> : null}</div>
            <p>{profile.bio}</p>
            <div className="heroActions">
              <button ref={primaryFollowRef} className={`primaryAction ${profile.viewerFollows ? "isFollowing" : ""}`} type="button" onClick={follow}>
                <Icon name={profile.viewerFollows ? "check" : "pulse"} />
                {profile.viewerFollows ? "Вы следите за вкусом" : "Следить за вкусом"}
              </button>
              {profile.viewerFollows && profile.playlistUrl ? <a className="playlistAction" href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" /> Живой плейлист <Icon name="arrow" size={17} /></a> : profile.viewerFollows ? <button className="playlistAction" type="button" disabled><Icon name="clock" /> Плейлист готовится</button> : null}
            </div>
            <div className="heroTrust"><Icon name="shield" size={18} /><span>Опубликовано с разрешения. Можно поставить на паузу в любой момент.</span></div>
            {profile.viewerFollows && telegramState.available ? <div className={`telegramControl ${telegramState.subscribed ? "isActive" : ""}`}><span className="telegramMark"><Icon name="send" /></span><div><strong>{telegramState.subscribed ? "Уведомления включены" : "Один сигнал в Telegram"}</strong><small>{telegramState.subscribed ? "Сообщим о новой музыке не чаще раза в день." : "Когда история обновится, пришлём одну дневную сводку со ссылкой на плейлист."}</small></div><button type="button" disabled={telegramBusy} onClick={() => void (telegramState.subscribed ? disconnectTelegram() : connectTelegram())}>{telegramBusy ? "Проверяем…" : telegramState.subscribed ? "Отключить" : "Включить"}</button></div> : null}
          </div>
        </section>

        <section className="profileStats" aria-label="Статистика профиля">
          <div><strong>{compactNumber(profile.followerCount)}</strong><span>следят за вкусом</span></div>
          <div><strong>{profile.totalEventCount30d}</strong><span>событий за 30 дней</span></div>
          <div><strong>{profile.playlistTrackCount}</strong><span>треков в живом плейлисте</span></div>
          <button type="button" onClick={share}><Icon name="share" /><span>Поделиться профилем</span></button>
        </section>

        {profile.fixture ? (
          <aside className="fixtureNotice">
            <Icon name="spark" />
            <p><strong>Это тестовый профиль.</strong> После подключения согласованного аккаунта здесь появится реальная история с выбранной задержкой.</p>
          </aside>
        ) : null}

        <section className="listeningSection">
          <header className="sectionHeader">
            <div><span>01 / последние события</span><h2>Последние прослушивания</h2></div>
            <p>Новые разрешённые события появляются здесь автоматически.</p>
          </header>
          <div className="eventList">
            {profile.historyAccess === "teaser" ? [0, 1, 2].map(index => (
              <article className="eventRow lockedEventRow" key={index} aria-hidden="true">
                <span className="eventIndex">{String(index + 1).padStart(2, "0")}</span>
                <span className="lockedCover"><Icon name="lock" size={16} /></span>
                <div className="eventTrack"><strong /><span /></div>
                <div className="eventSignal"><i /><span>доступно после входа</span></div>
                <time>—</time>
                <span className="lockedOpen"><Icon name="lock" size={15} /></span>
              </article>
            )) : profile.events.slice(0, 6).map((event, index) => (
              <article className="eventRow" key={event.id}>
                <span className="eventIndex">{String(index + 1).padStart(2, "0")}</span>
                <CoverArt tone={event.track.coverTone} title={event.track.title} />
                <div className="eventTrack"><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span></div>
                <div className="eventSignal"><i /><span>{index === 0 ? "последний сигнал" : event.playCount7d > 2 ? "возвращается к треку" : "в истории"}</span></div>
                <time>{listeningTime(event)}</time>
                <a className="trackOpen" href={`/go/track/${event.id}`} target="_blank" rel="noreferrer" aria-label={`Открыть ${event.track.title} в Яндекс Музыке`}>
                  <span>Открыть</span><Icon name="arrow" />
                </a>
              </article>
            ))}
          </div>
        </section>

        {profile.historyAccess === "teaser" ? <section className="historyUnlockSection"><div className="unlockSignal" aria-hidden="true"><i /><i /><i /><i /></div><span>история защищена входом</span><h2>Музыкальный вкус —<br />для своих.</h2><p>Войдите через Яндекс ID, чтобы открыть последние события, повторы и новое. Вход не подписывает вас автоматически и не даёт Тейсту доступ к вашей музыке.</p><div className="unlockBenefits"><span><Icon name="music" />Последние прослушивания</span><span><Icon name="pulse" />Повторы за 7 дней</span><span><Icon name="spark" />Впервые замеченные треки</span></div><Link className="historyUnlockAction" href={unlockHref} onClick={unlockHistory}><span>Я</span>Войти и открыть историю <Icon name="arrow" /></Link><small>Подписка на автора — отдельное осознанное действие после входа.</small></section> : <>
        <section className="repeatSection">
          <header className="sectionHeader sectionHeaderLight">
            <div><span>02 / повторы</span><h2>На повторе</h2></div>
            <p>Наблюдаемые повторы за последние 7 дней — не статистика Яндекса.</p>
          </header>
          <div className="repeatGrid">
            {onRepeat.length ? onRepeat.map((event, index) => (
              <a href={`/go/track/${event.id}?source=on_repeat&position=${index + 1}`} target="_blank" rel="noreferrer" className="repeatItem" key={event.id}>
                <CoverArt tone={event.track.coverTone} title={event.track.title} size="large" />
                <span className="repeatRank">0{index + 1}</span>
                <strong>{event.track.title}</strong>
                <span>{event.track.artists.join(", ")}</span>
                <em>{event.consecutiveCount >= 2 ? `${event.consecutiveCount} подряд · ${event.playCount7d} за 7 дней` : `${event.playCount7d} наблюдаемых повторов за 7 дней`}</em>
              </a>
            )) : <div className="sectionEmpty"><Icon name="pulse" /><strong>Повторы ещё не накопились</strong><span>Здесь появятся треки, которые встречались в истории несколько раз.</span></div>}
          </div>
        </section>

        <section className="firstSeenSection">
          <header className="sectionHeader">
            <div><span>03 / впервые замечено</span><h2>Новое в этой истории</h2></div>
            <p>Это первое появление в нашей истории, а не утверждение о личном «открытии» трека.</p>
          </header>
          <div className="firstSeenList">
            {firstSeen.length ? firstSeen.map((event, index) => (
              <a href={`/go/track/${event.id}?source=new&position=${index + 1}`} target="_blank" rel="noreferrer" key={event.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <CoverArt tone={event.track.coverTone} title={event.track.title} size="small" />
                <div><strong>{event.track.title}</strong><small>{event.track.artists.join(", ")}</small></div>
                <em>впервые в Тейсте {relativeTime(event.firstSeenAt)}</em>
                <Icon name="arrow" />
              </a>
            )) : <div className="sectionEmpty"><Icon name="spark" /><strong>Новых записей пока нет</strong><span>Раздел заполнится после первой автоматической проверки истории.</span></div>}
          </div>
        </section>
        </>}

      </main>

      {mobileActionVisible && !footerVisible ? <div className={`mobileActions ${profile.viewerFollows && profile.playlistUrl ? "withPlaylist" : "single"}`}>
        <button type="button" onClick={follow}><Icon name={profile.viewerFollows ? "check" : "pulse"} />{profile.viewerFollows ? "Подписка активна" : "Следить"}</button>
        {profile.viewerFollows && profile.playlistUrl ? <a href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" />Плейлист</a> : profile.viewerFollows ? <button type="button" disabled><Icon name="clock" />Скоро</button> : null}
      </div> : null}

      {playlistPromptOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setPlaylistPromptOpen(false); }}>
          <section className="authModal playlistPrompt" role="dialog" aria-modal="true" aria-labelledby="playlist-prompt-title">
            <button className="modalClose" type="button" onClick={() => setPlaylistPromptOpen(false)} aria-label="Закрыть"><Icon name="x" /></button>
            <span className="modalSignal"><i /><i /><i /></span>
            <small>подписка в Тейсте активна</small>
            <h2 id="playlist-prompt-title">Теперь добавьте «Что слушает {profile.name}» в Яндекс Музыку</h2>
            <p>Новые разрешённые треки будут автоматически появляться по этой же постоянной ссылке. В Яндекс Музыке добавьте плейлист к себе, чтобы он остался под рукой.</p>
            {profile.playlistUrl ? <a className="yandexLogin" href={`/go/playlist/${profile.id}?source=follow_success`} target="_blank" rel="noreferrer" onClick={() => setPlaylistPromptOpen(false)}><span>Я</span>Открыть и добавить плейлист<Icon name="arrow" /></a> : <button className="yandexLogin playlistPreparing" type="button" disabled><span>Я</span>Плейлист создаётся автоматически<Icon name="clock" /></button>}
            {telegramState.available ? <button className="telegramPromptAction" type="button" disabled={telegramBusy} onClick={() => void connectTelegram()}><Icon name="send" />{telegramBusy ? "Проверяем подключение…" : "Получать дневную сводку в Telegram"}</button> : null}
            <button className="playlistPromptLater" type="button" onClick={() => setPlaylistPromptOpen(false)}>Остаться в Тейсте</button>
            <div className="modalPrivacy"><Icon name="lock" size={16} /> Тейст не получает доступ к музыке фаната. Добавление плейлиста подтверждается лично в Яндекс Музыке.</div>
          </section>
        </div>
      ) : null}

      {authOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setAuthOpen(false); }}>
          <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modalClose" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть"><Icon name="x" /></button>
            <span className="modalSignal"><i /><i /><i /></span>
            <small>один раз — и готово</small>
            <h2 id="auth-title">Войдите, чтобы следить за вкусом «{profile.name}»</h2>
            <p>Яндекс ID нужен только для вашей учётной записи Тейста. Доступ к вашей Яндекс Музыке мы не запрашиваем.</p>
            <Link className="yandexLogin" href={authHref}><span>Я</span>Продолжить с Яндекс ID<Icon name="arrow" /></Link>
            <div className="modalPrivacy"><Icon name="lock" size={16} /> После входа подписка завершится автоматически — второй клик не нужен.</div>
          </section>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><Icon name={toast.tone === "error" ? "shield" : toast.tone === "success" ? "check" : "pulse"} />{toast.text}</div> : null}
    </>
  );
}
