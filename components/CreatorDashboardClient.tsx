"use client";

import { useEffect, useState } from "react";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { fixtureProfile } from "@/lib/fixtures";
import { fullNumber, relativeTime } from "@/lib/format";

type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };

export function CreatorDashboardClient({ preview }: { preview: boolean }) {
  const [paused, setPaused] = useState(false);
  const [delay, setDelay] = useState<0 | 86400>(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [notice, setNotice] = useState(preview ? "Preview-режим: интерфейс полностью интерактивен, но изменения не отправляются в production-БД." : "");
  const [connectOpen, setConnectOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [connectionState, setConnectionState] = useState<"connected" | "starting" | "waiting" | "error">("connected");

  useEffect(() => {
    if (!challenge || preview || connectionState !== "waiting") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/creator/music/connect/status/${challenge.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string };
      if (payload.status === "connected") {
        setConnectionState("connected");
        setChallenge(null);
        setConnectOpen(false);
        setNotice("Яндекс Музыка подключена. Первая синхронизация запущена.");
      } else if (!response.ok && response.status !== 202) setConnectionState("error");
    }, Math.max(5000, challenge.interval * 1000));
    return () => window.clearInterval(interval);
  }, [challenge, connectionState, preview]);

  async function saveControl(type: string, value?: unknown) {
    if (preview) {
      setNotice("Изменение показано локально. В live-режиме оно применяется сервером и попадает в audit log.");
      return;
    }
    const response = await fetch("/api/creator/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, value }) });
    setNotice(response.ok ? "Настройка сохранена и применена." : "Не удалось сохранить настройку.");
  }

  async function startConnection() {
    setConnectionState("starting");
    if (preview) {
      setChallenge({ id: "preview-challenge", userCode: "F7KM-2QPW", verificationUrl: "https://oauth.yandex.ru/device", expiresAt: new Date(Date.now() + 600_000).toISOString(), interval: 5 });
      setConnectionState("waiting");
      return;
    }
    const response = await fetch("/api/creator/music/connect/start", { method: "POST" });
    const payload = await response.json().catch(() => ({})) as Challenge & { error?: string };
    if (!response.ok) {
      setConnectionState("error");
      setNotice(payload.error || "Не удалось начать подключение.");
      return;
    }
    setChallenge(payload);
    setConnectionState("waiting");
  }

  function hideEvent(id: string) {
    const next = hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id];
    setHidden(next);
    void saveControl(hidden.includes(id) ? "restore_event" : "hide_event", id);
  }

  return (
    <>
      <header className="workspaceTopbar creatorTopbar"><div><span>кабинет автора / Лера Север</span><h1>Ваш Taste — ваши правила</h1></div><div><a className="ghostButton" href="/t/lera-sever" target="_blank"><Icon name="eye" />Открыть профиль</a><button type="button" className={`pauseButton ${paused ? "resume" : ""}`} onClick={() => { setPaused(value => !value); void saveControl(paused ? "resume" : "pause"); }}><Icon name={paused ? "play" : "pause"} />{paused ? "Возобновить Taste" : "Поставить на паузу"}</button></div></header>
      {notice ? <div className="workspaceNotice warning"><Icon name="shield" /><span>{notice}</span><button type="button" onClick={() => setNotice("")}><Icon name="x" size={17} /></button></div> : null}
      {paused ? <section className="pauseBanner"><Icon name="pause" size={30} /><div><strong>Taste на паузе</strong><p>Новые события не публикуются, плейлист не меняется. Последнее публичное состояние сохранено.</p></div><button type="button" onClick={() => { setPaused(false); void saveControl("resume"); }}>Возобновить</button></section> : null}

      <section className="creatorMetrics"><article><span>следят за вкусом</span><strong>{fullNumber(fixtureProfile.followerCount)}</strong><em>+842 за 7 дней</em></article><article><span>просмотры · 7д</span><strong>24 710</strong><em>18 420 уникальных</em></article><article><span>открыли трек · 7д</span><strong>6 834</strong><em>music intent, не стримы</em></article><article><span>live-плейлист</span><strong>47 <small>/ 50</small></strong><em>обновлён 2 мин назад</em></article></section>

      <section className="creatorGrid">
        <article className="creatorPanel connectionPanel" id="connection"><header><div><span>connection 01</span><h2>Яндекс Музыка</h2></div><span className="statusTag status-active"><i />connected</span></header><div className="accountCard"><span className="yandexAvatar">Я</span><div><strong>lera.sever.test</strong><small>Тестовый музыкальный аккаунт · ID •••• 4281</small></div><button type="button" onClick={() => setConnectOpen(true)}>Переподключить</button></div><dl><div><dt>Последняя синхронизация</dt><dd>3 мин назад</dd></div><div><dt>Срок токена</dt><dd>через 346 дней</dd></div><div><dt>Последняя ошибка</dt><dd>нет</dd></div><div><dt>Интервал</dt><dd>5 минут</dd></div></dl><footer><span><Icon name="lock" />Токен зашифрован и никогда не показывается в браузере.</span><button type="button" onClick={() => void saveControl("sync_now")}><Icon name="sync" />Sync now</button></footer></article>

        <article className="creatorPanel privacyPanel" id="privacy"><header><div><span>privacy 02</span><h2>Публикация</h2></div><Icon name="shield" /></header><label className="masterToggle"><div><strong>Публиковать Taste</strong><small>Главный выключатель профиля</small></div><input type="checkbox" defaultChecked onChange={event => void saveControl("publish_enabled", event.target.checked)} /><i /></label><div className="delayControl"><span>Задержка публикации</span><div><button className={delay === 0 ? "active" : ""} type="button" onClick={() => { setDelay(0); void saveControl("delay", 0); }}>Сразу</button><button className={delay === 86400 ? "active" : ""} type="button" onClick={() => { setDelay(86400); void saveControl("delay", 86400); }}>Через 24 часа</button></div></div><div className="privacyCounts"><button type="button"><span>Скрытые треки</span><strong>{hidden.length}</strong><Icon name="arrow" /></button><button type="button"><span>Скрытые артисты</span><strong>2</strong><Icon name="arrow" /></button></div><p><Icon name="clock" />Изменения приватности сразу убирают контент из профиля и следующей версии плейлиста.</p></article>
      </section>

      <section className="creatorPanel historyPanel" id="history"><header><div><span>history review 03</span><h2>Последние события</h2></div><div className="historyLegend"><span><i className="public" />public</span><span><i className="scheduled" />scheduled</span><span><i className="hidden" />hidden</span></div></header><div className="creatorEventList">{fixtureProfile.events.map(event => { const isHidden = hidden.includes(event.id); return <article key={event.id} className={isHidden ? "eventHidden" : ""}><CoverArt tone={event.track.coverTone} title={event.track.title} size="small" /><div><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span></div><time>{relativeTime(event.observedAt)}</time><span className={`visibilityBadge ${isHidden ? "hidden" : "public"}`}><i />{isHidden ? "hidden by creator" : "public"}</span><button type="button" onClick={() => hideEvent(event.id)}>{isHidden ? "Вернуть" : "Скрыть"}</button><button type="button" className="artistHide" onClick={() => void saveControl("hide_artist", event.track.artists[0])}>Скрыть артиста</button></article>; })}</div></section>

      <section className="creatorGrid lowerCreatorGrid"><article className="creatorPanel playlistPanel"><header><div><span>delivery 04</span><h2>Живой плейлист</h2></div><Icon name="playlist" /></header><div><span className="playlistCover"><i /><b>TASTE</b><small>Лера Север</small></span><div><strong>Что слушает Лера Север</strong><p>Последние 50 уникальных разрешённых треков. Один стабильный URL.</p><a href="/go/playlist/10000000-0000-4000-8000-000000000001" target="_blank">Открыть в Яндекс Музыке <Icon name="arrow" /></a></div></div><footer><span>47 треков · revision 48</span><button type="button" onClick={() => void saveControl("playlist_sync")}><Icon name="sync" />Обновить сейчас</button></footer></article><article className="creatorPanel consentPanel"><header><div><span>consent 05</span><h2>Согласие и данные</h2></div><Icon name="check" /></header><dl><div><dt>Версия согласия</dt><dd>pilot-1.0</dd></div><div><dt>Подтверждено</dt><dd>12 августа 2026</dd></div><div><dt>Состояние</dt><dd>активно</dd></div></dl><button type="button" onClick={() => void saveControl("disconnect")}>Отключить Яндекс Музыку</button><button type="button" className="dangerLink" onClick={() => void saveControl("delete_request")}>Запросить удаление данных</button></article></section>

      {connectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setConnectOpen(false); setChallenge(null); }}><Icon name="x" /></button><span>экспериментальное подключение</span><h2>Подключить Яндекс Музыку</h2>{!challenge ? <><p>Вы перейдёте на защищённую страницу Яндекса и введёте одноразовый код. Пароль и музыкальный токен не попадут в Taste-интерфейс.</p><div className="consentChecklist"><span><Icon name="check" />Читать недавнюю историю</span><span><Icon name="check" />Создавать публичный live-плейлист</span><span><Icon name="check" />Отключить доступ в любой момент</span></div><button className="darkButton wideButton" type="button" onClick={() => void startConnection()}>{connectionState === "starting" ? "Получаем код…" : "Получить одноразовый код"}</button></> : <><p>Откройте Яндекс, введите код и подтвердите доступ.</p><div className="deviceCode"><small>ваш код</small><strong>{challenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={challenge.verificationUrl} target="_blank" rel="noreferrer">Открыть страницу Яндекса <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения. Это окно можно оставить открытым.</span></div></>}</section></div> : null}
    </>
  );
}

