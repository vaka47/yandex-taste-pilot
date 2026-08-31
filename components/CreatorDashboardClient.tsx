"use client";

import { useEffect, useRef, useState } from "react";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { fixtureProfile } from "@/lib/fixtures";
import { fullNumber, relativeTime } from "@/lib/format";
import type { CreatorDashboardData } from "@/lib/server/dashboard";

type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };

const previewData: CreatorDashboardData = {
  id: fixtureProfile.id, slug: fixtureProfile.slug, name: fixtureProfile.name, roleLine: fixtureProfile.roleLine,
  avatarUrl: fixtureProfile.avatarUrl,
  status: fixtureProfile.status, publishEnabled: true, publicationDelaySeconds: 0, followerCount: fixtureProfile.followerCount,
  profileViews7d: 24710, uniqueVisitors7d: 18420, trackOpens7d: 6834,
  connection: { status: "connected", login: "lera.sever.test", accountIdSuffix: "4281", lastSuccessAt: fixtureProfile.lastSyncAt, expiresAt: new Date(Date.now() + 346 * 86_400_000).toISOString(), errorCode: null },
  playlist: { url: fixtureProfile.playlistUrl, trackCount: 47, maxTracks: 50, revision: 48, lastSyncAt: fixtureProfile.lastSyncAt },
  consentVersion: "pilot-1.0", consentAt: new Date(Date.now() - 18 * 86_400_000).toISOString(), hiddenArtistCount: 2,
  events: fixtureProfile.events
};

function expiresLabel(value: string | null) {
  if (!value) return "не ограничен";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "истёк";
  return days === 1 ? "через 1 день" : `через ${days} дн.`;
}

async function prepareSquareAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10_000_000) throw new Error("INVALID_IMAGE");
  const bitmap = await createImageBitmap(file);
  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .88));
  if (!blob) throw new Error("IMAGE_PROCESSING_FAILED");
  return new File([blob], "taste-avatar.webp", { type: "image/webp" });
}

export function CreatorDashboardClient({ preview, initialData }: { preview: boolean; initialData: CreatorDashboardData | null }) {
  const data = initialData || previewData;
  const [paused, setPaused] = useState(data.status === "paused");
  const [publishing, setPublishing] = useState(data.publishEnabled);
  const [delay, setDelay] = useState<0 | 86400>(data.publicationDelaySeconds === 86400 ? 86400 : 0);
  const [hidden, setHidden] = useState<string[]>(data.events.filter(event => event.visibility === "hidden").map(event => event.id));
  const [notice, setNotice] = useState(preview ? "Preview-режим: интерфейс полностью интерактивен, но изменения не отправляются в production-БД." : "");
  const [connectOpen, setConnectOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [connectionState, setConnectionState] = useState<"connected" | "idle" | "starting" | "waiting" | "error">(data.connection.status === "connected" ? "connected" : data.connection.status === "error" ? "error" : "idle");
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(data.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);

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
        window.setTimeout(() => window.location.reload(), 800);
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

  async function uploadAvatar(file: File) {
    if (preview) { setNotice("В live-кабинете фото будет обрезано до квадрата и опубликовано в профиле."); return; }
    setAvatarBusy(true);
    try {
      const prepared = await prepareSquareAvatar(file);
      const form = new FormData();
      form.set("avatar", prepared);
      const response = await fetch("/api/creator/avatar", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { avatarUrl?: string; error?: string };
      if (!response.ok || !payload.avatarUrl) throw new Error(payload.error || "UPLOAD_FAILED");
      setAvatarUrl(payload.avatarUrl);
      setNotice("Фото профиля обновлено. Его же можно скачать для обложки live-плейлиста.");
    } catch {
      setNotice("Не удалось загрузить фото. Выберите JPG, PNG или WebP до 10 МБ.");
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    if (preview) { setNotice("В live-кабинете фото можно удалить в любой момент."); return; }
    setAvatarBusy(true);
    const response = await fetch("/api/creator/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    if (response.ok) { setAvatarUrl(null); setNotice("Фото удалено. В профиле снова используется фирменный Taste-портрет."); }
    else setNotice("Не удалось удалить фото.");
  }

  function hideEvent(id: string) {
    const next = hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id];
    setHidden(next);
    void saveControl(hidden.includes(id) ? "restore_event" : "hide_event", id);
  }

  return (
    <>
      <header className="workspaceTopbar creatorTopbar"><div><span>кабинет автора / {data.name}</span><h1>Ваш Taste — ваши правила</h1></div><div><a className="ghostButton" href={`/t/${data.slug}`} target="_blank"><Icon name="eye" />Открыть профиль</a><button type="button" className={`pauseButton ${paused ? "resume" : ""}`} onClick={() => { setPaused(value => !value); setPublishing(paused); void saveControl(paused ? "resume" : "pause"); }}><Icon name={paused ? "play" : "pause"} />{paused ? "Возобновить Taste" : "Поставить на паузу"}</button></div></header>
      {notice ? <div className="workspaceNotice warning"><Icon name="shield" /><span>{notice}</span><button type="button" onClick={() => setNotice("")}><Icon name="x" size={17} /></button></div> : null}
      {paused ? <section className="pauseBanner"><Icon name="pause" size={30} /><div><strong>Taste на паузе</strong><p>Новые события не публикуются, плейлист не меняется. Последнее публичное состояние сохранено.</p></div><button type="button" onClick={() => { setPaused(false); void saveControl("resume"); }}>Возобновить</button></section> : null}

      <section className="creatorIdentityCard" aria-label="Фото публичного профиля"><ProfilePortrait compact name={data.name} avatarUrl={avatarUrl} /><div><span>публичный профиль</span><strong>{data.name}</strong><small>{avatarUrl ? "Фото опубликовано в Taste и готово для обложки плейлиста" : "Можно оставить фирменный портрет или загрузить своё фото"}</small></div><div className="creatorIdentityActions"><label className="darkButton">{avatarBusy ? "Обрабатываем…" : avatarUrl ? "Заменить фото" : "Загрузить фото"}<input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></label>{avatarUrl ? <><a className="ghostButton" href={`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}download=1`}><Icon name="arrow" />Скачать для Яндекс Музыки</a><button className="identityRemove" type="button" disabled={avatarBusy} onClick={() => void removeAvatar()}>Удалить</button></> : null}</div></section>

      <section className="creatorMetrics"><article><span>следят за вкусом</span><strong>{fullNumber(data.followerCount)}</strong><em>активные подписки</em></article><article><span>просмотры · 7д</span><strong>{fullNumber(data.profileViews7d)}</strong><em>{fullNumber(data.uniqueVisitors7d)} уникальных</em></article><article><span>открыли трек · 7д</span><strong>{fullNumber(data.trackOpens7d)}</strong><em>music intent, не стримы</em></article><article><span>live-плейлист</span><strong>{data.playlist.trackCount} <small>/ {data.playlist.maxTracks}</small></strong><em>{data.playlist.lastSyncAt ? `обновлён ${relativeTime(data.playlist.lastSyncAt)}` : "ещё не создан"}</em></article></section>

      <section className="creatorGrid">
        <article className="creatorPanel connectionPanel" id="connection"><header><div><span>connection 01</span><h2>Яндекс Музыка</h2></div><span className={`statusTag status-${data.connection.status === "connected" ? "active" : data.connection.status}`}><i />{data.connection.status}</span></header><div className="accountCard"><span className="yandexAvatar">Я</span><div><strong>{data.connection.login || "Аккаунт не подключён"}</strong><small>{data.connection.accountIdSuffix ? `Музыкальный аккаунт · ID •••• ${data.connection.accountIdSuffix}` : "Подключите отдельный аккаунт автора"}</small></div><button type="button" onClick={() => setConnectOpen(true)}>{data.connection.status === "connected" ? "Переподключить" : "Подключить"}</button></div><dl><div><dt>Последняя синхронизация</dt><dd>{data.connection.lastSuccessAt ? relativeTime(data.connection.lastSuccessAt) : "ещё не было"}</dd></div><div><dt>Срок токена</dt><dd>{expiresLabel(data.connection.expiresAt)}</dd></div><div><dt>Последняя ошибка</dt><dd>{data.connection.errorCode || "нет"}</dd></div><div><dt>Интервал</dt><dd>5 минут</dd></div></dl><footer><span><Icon name="lock" />Токен зашифрован и никогда не показывается в браузере.</span><button type="button" disabled={data.connection.status !== "connected"} onClick={() => void saveControl("sync_now")}><Icon name="sync" />Sync now</button></footer></article>

        <article className="creatorPanel privacyPanel" id="privacy"><header><div><span>privacy 02</span><h2>Публикация</h2></div><Icon name="shield" /></header><label className="masterToggle"><div><strong>Публиковать Taste</strong><small>Главный выключатель профиля</small></div><input type="checkbox" checked={publishing} onChange={event => { setPublishing(event.target.checked); void saveControl("publish_enabled", event.target.checked); }} /><i /></label><div className="delayControl"><span>Задержка публикации</span><div><button className={delay === 0 ? "active" : ""} type="button" onClick={() => { setDelay(0); void saveControl("delay", 0); }}>Сразу</button><button className={delay === 86400 ? "active" : ""} type="button" onClick={() => { setDelay(86400); void saveControl("delay", 86400); }}>Через 24 часа</button></div></div><div className="privacyCounts"><button type="button"><span>Скрытые треки</span><strong>{hidden.length}</strong><Icon name="arrow" /></button><button type="button"><span>Скрытые артисты</span><strong>{data.hiddenArtistCount}</strong><Icon name="arrow" /></button></div><p><Icon name="clock" />Изменения приватности сразу убирают контент из профиля и следующей версии плейлиста.</p></article>
      </section>

      <section className="creatorPanel historyPanel" id="history"><header><div><span>history review 03</span><h2>Последние события</h2></div><div className="historyLegend"><span><i className="public" />public</span><span><i className="scheduled" />scheduled</span><span><i className="hidden" />hidden</span></div></header><div className="creatorEventList">{data.events.length ? data.events.map(event => { const isHidden = hidden.includes(event.id); return <article key={event.id} className={isHidden ? "eventHidden" : ""}><CoverArt tone={event.track.coverTone} title={event.track.title} size="small" /><div><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span></div><time>{relativeTime(event.observedAt)}</time><span className={`visibilityBadge ${isHidden ? "hidden" : event.visibility}`}><i />{isHidden ? "hidden by creator" : event.visibility}</span><button type="button" onClick={() => hideEvent(event.id)}>{isHidden ? "Вернуть" : "Скрыть"}</button><button type="button" className="artistHide" onClick={() => void saveControl("hide_artist", event.track.artists[0])}>Скрыть артиста</button></article>; }) : <article><div><strong>История пока пуста</strong><span>Подключите Яндекс Музыку — первая синхронизация появится здесь автоматически.</span></div></article>}</div></section>

      <section className="creatorGrid lowerCreatorGrid"><article className="creatorPanel playlistPanel"><header><div><span>delivery 04</span><h2>Живой плейлист</h2></div><Icon name="playlist" /></header><div><span className="playlistCover"><i /><b>TASTE</b><small>{data.name}</small></span><div><strong>Вкус {data.name} — live</strong><p>Последние {data.playlist.maxTracks} уникальных разрешённых треков. Один стабильный URL.</p>{data.playlist.url ? <a href={data.playlist.url} target="_blank" rel="noreferrer">Открыть в Яндекс Музыке <Icon name="arrow" /></a> : <span>Плейлист появится после первой успешной синхронизации.</span>}</div></div><footer><span>{data.playlist.trackCount} треков · revision {data.playlist.revision ?? "—"}</span><button type="button" disabled={data.connection.status !== "connected"} onClick={() => void saveControl("playlist_sync")}><Icon name="sync" />Обновить сейчас</button></footer></article><article className="creatorPanel consentPanel"><header><div><span>consent 05</span><h2>Согласие и данные</h2></div><Icon name="check" /></header><dl><div><dt>Версия согласия</dt><dd>{data.consentVersion || "не подтверждено"}</dd></div><div><dt>Подтверждено</dt><dd>{data.consentAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.consentAt)) : "—"}</dd></div><div><dt>Состояние</dt><dd>{data.connection.status === "connected" ? "активно" : "ожидает подключения"}</dd></div></dl><button type="button" disabled={data.connection.status !== "connected"} onClick={() => void saveControl("disconnect")}>Отключить Яндекс Музыку</button><button type="button" className="dangerLink" onClick={() => void saveControl("delete_request")}>Запросить удаление данных</button></article></section>

      {connectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setConnectOpen(false); setChallenge(null); }}><Icon name="x" /></button><span>экспериментальное подключение</span><h2>Подключить Яндекс Музыку</h2>{!challenge ? <><p>Вы перейдёте на защищённую страницу Яндекса и введёте одноразовый код. Пароль и музыкальный токен не попадут в Taste-интерфейс.</p><div className="consentChecklist"><span><Icon name="check" />Читать недавнюю историю</span><span><Icon name="check" />Передавать разрешённые треки в live-плейлист</span><span><Icon name="check" />Отключить доступ в любой момент</span></div><button className="darkButton wideButton" type="button" onClick={() => void startConnection()}>{connectionState === "starting" ? "Получаем код…" : "Получить одноразовый код"}</button></> : <><p>Откройте Яндекс под отдельным аккаунтом автора, введите код и подтвердите доступ.</p><div className="deviceCode"><small>ваш код</small><strong>{challenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={challenge.verificationUrl} target="_blank" rel="noreferrer">Открыть страницу Яндекса <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения. Это окно можно оставить открытым.</span></div></>}</section></div> : null}
    </>
  );
}
