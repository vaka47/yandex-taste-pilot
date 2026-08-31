"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { compactNumber, fullNumber, relativeTime } from "@/lib/format";
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
  const [playlistPromptOpen, setPlaylistPromptOpen] = useState(searchParams.get("follow") === "completed");
  const [toast, setToast] = useState<string | null>(null);
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
    trackEvent("tastemaker_profile_view", { tastemakerId: profile.id });
  }, [profile.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function follow() {
    trackEvent("follow_click", { tastemakerId: profile.id });
    if (!session) {
      setAuthOpen(true);
      return;
    }
    const response = await fetch(`/api/tastemakers/${profile.id}/follow`, { method: profile.viewerFollows ? "DELETE" : "POST" });
    if (!response.ok) {
      setToast("Не удалось изменить подписку. Попробуйте ещё раз.");
      return;
    }
    const payload = await response.json() as { following: boolean; followerCount: number };
    setProfile(current => ({ ...current, viewerFollows: payload.following, followerCount: payload.followerCount }));
    if (payload.following) {
      setToast(null);
      setPlaylistPromptOpen(true);
    } else setToast("Подписка отменена");
  }

  async function share() {
    trackEvent("share_click", { tastemakerId: profile.id });
    const shareData = { title: `Что слушает ${profile.name}`, text: `Реальная история прослушиваний ${profile.name} в Taste`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
      setToast("Ссылка скопирована");
    }
  }

  const authHref = `/auth/yandex/start?returnTo=${encodeURIComponent(`/t/${profile.slug}`)}&follow=${encodeURIComponent(profile.id)}`;

  return (
    <>
      <main className="profilePage">
        <section className="profileHero">
          <div className="portraitStage">
            <div className="portraitMeta"><span>taste signal</span><b>01—{new Date().getFullYear()}</b></div>
            <ProfilePortrait name={profile.name} />
            <div className="nowTape">
              <span className="liveDot" />
              <div><small>последний сигнал · {relativeTime(profile.events[0]?.observedAt || null)}</small><strong>{profile.events[0]?.track.title}</strong><em>{profile.events[0]?.track.artists.join(", ")}</em></div>
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
              <button className={`primaryAction ${profile.viewerFollows ? "isFollowing" : ""}`} type="button" onClick={follow}>
                <Icon name={profile.viewerFollows ? "check" : "pulse"} />
                {profile.viewerFollows ? "Вы следите за вкусом" : "Следить за вкусом"}
              </button>
              {profile.playlistUrl ? <a className="playlistAction" href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" /> Живой плейлист <Icon name="arrow" size={17} /></a> : <button className="playlistAction" type="button" disabled><Icon name="clock" /> Плейлист готовится</button>}
            </div>
            <div className="heroTrust"><Icon name="shield" size={18} /><span>Опубликовано с разрешения. Можно поставить на паузу в любой момент.</span></div>
          </div>
        </section>

        <section className="profileStats" aria-label="Статистика профиля">
          <div><strong>{compactNumber(profile.followerCount)}</strong><span>следят за вкусом</span></div>
          <div><strong>{profile.events.length}</strong><span>сигналов за 7 дней</span></div>
          <div><strong>{profile.playlistTrackCount}</strong><span>треков в live-плейлисте</span></div>
          <button type="button" onClick={share}><Icon name="share" /><span>Поделиться профилем</span></button>
        </section>

        {profile.fixture ? (
          <aside className="fixtureNotice">
            <Icon name="spark" />
            <p><strong>Это честный pilot-preview.</strong> Сейчас здесь тестовые события. После подключения согласованного аккаунта тот же интерфейс показывает реальную историю с заданной задержкой.</p>
          </aside>
        ) : null}

        <section className="listeningSection">
          <header className="sectionHeader">
            <div><span>01 / live log</span><h2>Недавно слушала</h2></div>
            <p>Новые разрешённые события появляются здесь автоматически.</p>
          </header>
          <div className="eventList">
            {profile.events.slice(0, 6).map((event, index) => (
              <article className="eventRow" key={event.id}>
                <span className="eventIndex">{String(index + 1).padStart(2, "0")}</span>
                <CoverArt tone={event.track.coverTone} title={event.track.title} />
                <div className="eventTrack"><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span></div>
                <div className="eventSignal"><i /><span>{index === 0 ? "последний сигнал" : event.playCount7d > 2 ? "возвращается к треку" : "в истории"}</span></div>
                <time>{relativeTime(event.observedAt)}</time>
                <a className="trackOpen" href={`/go/track/${event.id}`} target="_blank" rel="noreferrer" aria-label={`Открыть ${event.track.title} в Яндекс Музыке`}>
                  <span>Открыть</span><Icon name="arrow" />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="repeatSection">
          <header className="sectionHeader sectionHeaderLight">
            <div><span>02 / pattern</span><h2>На повторе</h2></div>
            <p>Наблюдаемые повторы за последние 7 дней — не статистика Яндекса.</p>
          </header>
          <div className="repeatGrid">
            {onRepeat.map((event, index) => (
              <a href={`/go/track/${event.id}?source=on_repeat&position=${index + 1}`} target="_blank" rel="noreferrer" className="repeatItem" key={event.id}>
                <CoverArt tone={event.track.coverTone} title={event.track.title} size="large" />
                <span className="repeatRank">0{index + 1}</span>
                <strong>{event.track.title}</strong>
                <span>{event.track.artists.join(", ")}</span>
                <em>{event.consecutiveCount >= 2 ? `${event.consecutiveCount} подряд · ${event.playCount7d} за 7 дней` : `${event.playCount7d} наблюдаемых повторов за 7 дней`}</em>
              </a>
            ))}
          </div>
        </section>

        <section className="firstSeenSection">
          <header className="sectionHeader">
            <div><span>03 / first seen</span><h2>Впервые замечено Taste</h2></div>
            <p>Это первое появление в нашей истории, а не утверждение о личном «открытии» трека.</p>
          </header>
          <div className="firstSeenList">
            {firstSeen.map((event, index) => (
              <a href={`/go/track/${event.id}?source=new&position=${index + 1}`} target="_blank" rel="noreferrer" key={event.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <CoverArt tone={event.track.coverTone} title={event.track.title} size="small" />
                <div><strong>{event.track.title}</strong><small>{event.track.artists.join(", ")}</small></div>
                <em>впервые в Taste {relativeTime(event.firstSeenAt)}</em>
                <Icon name="arrow" />
              </a>
            ))}
          </div>
        </section>

        <section className="profileCta">
          <div><span>не пропустить следующий трек</span><h2>Вкус меняется.<br />Следите вживую.</h2></div>
          <button type="button" onClick={follow}><Icon name="pulse" /> {profile.viewerFollows ? "Вы уже следите" : "Следить за вкусом"}</button>
          <p>{fullNumber(profile.followerCount)} человек уже следят. Просмотр профиля всегда остаётся открытым.</p>
        </section>
      </main>

      <div className="mobileActions">
        <button type="button" onClick={follow}><Icon name={profile.viewerFollows ? "check" : "pulse"} />{profile.viewerFollows ? "Подписка активна" : "Следить"}</button>
        {profile.playlistUrl ? <a href={`/go/playlist/${profile.id}`} target="_blank" rel="noreferrer"><Icon name="playlist" />Плейлист</a> : <button type="button" disabled><Icon name="clock" />Скоро</button>}
      </div>

      {playlistPromptOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setPlaylistPromptOpen(false); }}>
          <section className="authModal playlistPrompt" role="dialog" aria-modal="true" aria-labelledby="playlist-prompt-title">
            <button className="modalClose" type="button" onClick={() => setPlaylistPromptOpen(false)} aria-label="Закрыть"><Icon name="x" /></button>
            <span className="modalSignal"><i /><i /><i /></span>
            <small>подписка Taste активна</small>
            <h2 id="playlist-prompt-title">Теперь добавьте «Что слушает {profile.name}» в Яндекс Музыку</h2>
            <p>Новые разрешённые треки будут автоматически появляться по этой же постоянной ссылке. В Яндекс Музыке нажмите лайк — плейлист попадёт в раздел «Вам понравилось».</p>
            {profile.playlistUrl ? <a className="yandexLogin" href={`/go/playlist/${profile.id}?source=follow_success`} target="_blank" rel="noreferrer" onClick={() => setPlaylistPromptOpen(false)}><span>Я</span>Открыть и добавить плейлист<Icon name="arrow" /></a> : <button className="yandexLogin playlistPreparing" type="button" disabled><span>Я</span>Плейлист создаётся автоматически<Icon name="clock" /></button>}
            <button className="playlistPromptLater" type="button" onClick={() => setPlaylistPromptOpen(false)}>Остаться в Taste</button>
            <div className="modalPrivacy"><Icon name="lock" size={16} /> Taste не получает доступ к музыке фаната. Добавление плейлиста подтверждается лично в Яндекс Музыке.</div>
          </section>
        </div>
      ) : null}

      {authOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setAuthOpen(false); }}>
          <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modalClose" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть"><Icon name="x" /></button>
            <span className="modalSignal"><i /><i /><i /></span>
            <small>один раз — и готово</small>
            <h2 id="auth-title">Войдите, чтобы подписаться на Taste-профиль «{profile.name}»</h2>
            <p>Яндекс ID нужен только для вашей учётной записи Taste. Доступ к вашей Яндекс Музыке мы не запрашиваем.</p>
            <Link className="yandexLogin" href={authHref}><span>Я</span>Продолжить с Яндекс ID<Icon name="arrow" /></Link>
            <div className="modalPrivacy"><Icon name="lock" size={16} /> После входа подписка завершится автоматически — второй клик не нужен.</div>
          </section>
        </div>
      ) : null}

      {toast ? <div className="toast" role="status"><Icon name="check" />{toast}</div> : null}
    </>
  );
}
