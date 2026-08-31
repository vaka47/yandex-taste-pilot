"use client";

import { useEffect, useRef, useState } from "react";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { fullNumber, relativeTime } from "@/lib/format";
import type { CreatorDashboardData } from "@/lib/server/dashboard";

type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };
type ProfileDraft = { name: string; roleLine: string; bio: string };

const connectionLabels: Record<string, string> = {
  connected: "подключена", pending: "ожидает", error: "ошибка", disconnected: "отключена", not_connected: "не подключена"
};
const visibilityLabels: Record<string, string> = { public: "опубликован", pending: "ожидает", hidden: "скрыт" };
const syncOptions = [{ value: 300, label: "5 минут" }, { value: 900, label: "15 минут" }, { value: 3600, label: "1 час" }];

function expiresLabel(value: string | null) {
  if (!value) return "без срока";
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

export function CreatorDashboardClient({ initialData }: { initialData: CreatorDashboardData | null }) {
  if (!initialData) return <section className="workspaceEmpty"><Icon name="users" /><h1>Профиль ещё не назначен</h1><p>Откройте персональную ссылку-приглашение, которую прислал владелец Taste.</p></section>;
  return <CreatorDashboard data={initialData} />;
}

function CreatorDashboard({ data }: { data: CreatorDashboardData }) {
  const [paused, setPaused] = useState(data.status === "paused");
  const [publishing, setPublishing] = useState(data.publishEnabled);
  const [delay, setDelay] = useState<0 | 86400>(data.publicationDelaySeconds === 86400 ? 86400 : 0);
  const [syncInterval, setSyncInterval] = useState(data.syncIntervalSeconds);
  const [hidden, setHidden] = useState<string[]>(data.events.filter(event => event.visibility === "hidden").map(event => event.id));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [connectionState, setConnectionState] = useState<"connected" | "idle" | "starting" | "waiting" | "error">(data.connection.status === "connected" ? "connected" : data.connection.status === "error" ? "error" : "idle");
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(data.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profile, setProfile] = useState<ProfileDraft>({ name: data.name, roleLine: data.roleLine, bio: data.bio });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!challenge || connectionState !== "waiting") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/creator/music/connect/status/${challenge.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string };
      if (payload.status === "connected") {
        setConnectionState("connected");
        setChallenge(null);
        setConnectOpen(false);
        setNotice("Яндекс Музыка подключена. История и плейлист будут обновляться автоматически.");
        window.setTimeout(() => window.location.reload(), 900);
      } else if (!response.ok && response.status !== 202) setConnectionState("error");
    }, Math.max(5000, challenge.interval * 1000));
    return () => window.clearInterval(interval);
  }, [challenge, connectionState]);

  async function saveControl(type: string, value?: unknown, successText = "Настройка сохранена.") {
    setBusy(type);
    const response = await fetch("/api/creator/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, value }) });
    setBusy(null);
    setNotice(response.ok ? successText : "Не удалось сохранить изменение. Попробуйте ещё раз.");
    return response.ok;
  }

  async function saveProfile() {
    setBusy("profile");
    const response = await fetch("/api/creator/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(profileDraft) });
    setBusy(null);
    if (!response.ok) { setNotice("Проверьте имя, подпись и описание."); return; }
    setProfile(profileDraft);
    setEditOpen(false);
    setNotice("Публичная страница обновлена.");
  }

  async function startConnection() {
    setConnectionState("starting");
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
    setAvatarBusy(true);
    try {
      const prepared = await prepareSquareAvatar(file);
      const form = new FormData();
      form.set("avatar", prepared);
      const response = await fetch("/api/creator/avatar", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { avatarUrl?: string; error?: string };
      if (!response.ok || !payload.avatarUrl) throw new Error(payload.error || "UPLOAD_FAILED");
      setAvatarUrl(payload.avatarUrl);
      setNotice("Фото профиля обновлено.");
    } catch {
      setNotice("Не удалось загрузить фото. Выберите JPG, PNG или WebP до 10 МБ.");
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    const response = await fetch("/api/creator/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    if (response.ok) { setAvatarUrl(null); setNotice("Фото удалено. В профиле снова используется фирменный портрет."); }
    else setNotice("Не удалось удалить фото.");
  }

  async function copyProfileLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/t/${data.slug}`).catch(() => undefined);
    setNotice("Ссылка для фанатов скопирована.");
  }

  function hideEvent(id: string) {
    const wasHidden = hidden.includes(id);
    setHidden(wasHidden ? hidden.filter(value => value !== id) : [...hidden, id]);
    void saveControl(wasHidden ? "restore_event" : "hide_event", id, wasHidden ? "Трек снова опубликован." : "Трек скрыт из профиля и плейлиста.");
  }

  const connectionStatus = connectionState === "connected" ? "connected" : connectionState === "error" ? "error" : data.connection.status;

  return (
    <>
      <header className="workspaceTopbar creatorTopbar"><div><span>кабинет автора · {profile.name}</span><h1>Ваш профиль вкуса</h1></div><button type="button" className={`pauseButton ${paused ? "resume" : ""}`} onClick={() => { const resume = paused; setPaused(!paused); setPublishing(resume); void saveControl(resume ? "resume" : "pause", undefined, resume ? "Публикация возобновлена." : "Публикация приостановлена."); }}><Icon name={paused ? "play" : "pause"} />{paused ? "Возобновить" : "Поставить на паузу"}</button></header>
      {notice ? <div className="workspaceNotice success" role="status"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Закрыть"><Icon name="x" size={17} /></button></div> : null}
      {paused ? <section className="pauseBanner"><Icon name="pause" size={30} /><div><strong>Публикация на паузе</strong><p>Новые события не публикуются, плейлист не меняется. Всё уже опубликованное сохранено.</p></div><button type="button" onClick={() => { setPaused(false); setPublishing(true); void saveControl("resume", undefined, "Публикация возобновлена."); }}>Возобновить</button></section> : null}

      <section className="creatorIdentityCard" aria-label="Публичный профиль"><ProfilePortrait compact name={profile.name} avatarUrl={avatarUrl} /><div><span>публичная страница</span><strong>{profile.name}</strong><small>{profile.roleLine}{profile.bio ? ` · ${profile.bio}` : ""}</small></div><div className="creatorIdentityActions"><button className="darkButton" type="button" onClick={() => { setProfileDraft(profile); setEditOpen(true); }}><Icon name="settings" />Редактировать</button><button className="ghostButton" type="button" onClick={() => void copyProfileLink()}><Icon name="copy" />Ссылка для фанатов</button><label className="ghostButton">{avatarBusy ? "Обрабатываем…" : avatarUrl ? "Заменить фото" : "Загрузить фото"}<input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></label>{avatarUrl ? <button className="identityRemove" type="button" disabled={avatarBusy} onClick={() => void removeAvatar()}>Удалить фото</button> : null}</div></section>

      <section className="creatorMetrics"><article><span>следят за вкусом</span><strong>{fullNumber(data.followerCount)}</strong><em>активные подписки</em></article><article><span>просмотры · 7 дней</span><strong>{fullNumber(data.profileViews7d)}</strong><em>{fullNumber(data.uniqueVisitors7d)} уникальных</em></article><article><span>открыли трек · 7 дней</span><strong>{fullNumber(data.trackOpens7d)}</strong><em>переходы, не прослушивания</em></article><article><span>живой плейлист</span><strong>{data.playlist.trackCount} <small>/ {data.playlist.maxTracks}</small></strong><em>{data.playlist.lastSyncAt ? `обновлён ${relativeTime(data.playlist.lastSyncAt)}` : "создастся автоматически"}</em></article></section>

      <section className="creatorGrid">
        <article className="creatorPanel connectionPanel" id="connection"><header><div><span>источник истории</span><h2>Личная Яндекс Музыка</h2></div><span className={`statusTag status-${connectionStatus === "connected" ? "active" : connectionStatus}`}><i />{connectionLabels[connectionStatus] || "не подключена"}</span></header><div className="accountCard"><span className="yandexAvatar">Я</span><div><strong>{data.connection.login || "Аккаунт не подключён"}</strong><small>{data.connection.accountIdSuffix ? `Источник истории · ID •••• ${data.connection.accountIdSuffix}` : "Подключите аккаунт, в котором слушаете музыку"}</small></div><button type="button" onClick={() => setConnectOpen(true)}>{data.connection.status === "connected" ? "Переподключить" : "Подключить"}</button></div><dl><div><dt>Последняя проверка</dt><dd>{data.connection.lastSuccessAt ? relativeTime(data.connection.lastSuccessAt) : "ещё не было"}</dd></div><div><dt>Срок доступа</dt><dd>{expiresLabel(data.connection.expiresAt)}</dd></div><div><dt>Последняя ошибка</dt><dd>{data.connection.errorCode || "нет"}</dd></div><div><dt>Что считается прослушиванием</dt><dd>трек, дослушанный до конца</dd></div></dl><div className="syncIntervalControl"><span>Как часто проверять новые треки</span><div>{syncOptions.map(option => <button type="button" className={syncInterval === option.value ? "active" : ""} key={option.value} onClick={() => { setSyncInterval(option.value); void saveControl("sync_interval", option.value, `Интервал: ${option.label}.`); }}>{option.label}</button>)}</div><small>По умолчанию — каждые 5 минут. После обнаружения плейлист обновляется сразу.</small></div><footer><span><Icon name="lock" />Доступ зашифрован и не показывается в браузере.</span><button type="button" disabled={data.connection.status !== "connected" || busy === "sync_now"} onClick={() => void saveControl("sync_now", undefined, "История проверена, плейлист обновлён.")}><Icon name="sync" />{busy === "sync_now" ? "Проверяем…" : "Проверить сейчас"}</button></footer></article>

        <article className="creatorPanel privacyPanel" id="privacy"><header><div><span>управление публикацией</span><h2>Что видят фанаты</h2></div><Icon name="shield" /></header><label className="masterToggle"><div><strong>Публиковать профиль</strong><small>Главный выключатель истории</small></div><input type="checkbox" checked={publishing} onChange={event => { setPublishing(event.target.checked); void saveControl("publish_enabled", event.target.checked); }} /><i /></label><div className="delayControl"><span>Задержка новых треков</span><div><button className={delay === 0 ? "active" : ""} type="button" onClick={() => { setDelay(0); void saveControl("delay", 0, "Новые треки публикуются без задержки."); }}>Сразу</button><button className={delay === 86400 ? "active" : ""} type="button" onClick={() => { setDelay(86400); void saveControl("delay", 86400, "Включена задержка 24 часа."); }}>Через 24 часа</button></div></div><div className="privacyCounts"><div><span>Скрытые треки</span><strong>{hidden.length}</strong></div><div><span>Скрытые исполнители</span><strong>{data.hiddenArtistCount}</strong></div></div><p><Icon name="clock" />Скрытие сразу убирает трек из профиля и при следующем обновлении — из плейлиста.</p></article>
      </section>

      <section className="creatorPanel historyPanel" id="history"><header><div><span>проверка истории</span><h2>Последние события</h2></div><div className="historyLegend"><span><i className="public" />опубликовано</span><span><i className="scheduled" />ожидает</span><span><i className="hidden" />скрыто</span></div></header><div className="creatorEventList">{data.events.length ? data.events.map(event => { const isHidden = hidden.includes(event.id); return <article key={event.id} className={isHidden ? "eventHidden" : ""}><CoverArt tone={event.track.coverTone} title={event.track.title} size="small" /><div><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span></div><time>{relativeTime(event.observedAt)}</time><span className={`visibilityBadge ${isHidden ? "hidden" : event.visibility}`}><i />{isHidden ? "скрыт автором" : visibilityLabels[event.visibility]}</span><button type="button" onClick={() => hideEvent(event.id)}>{isHidden ? "Вернуть" : "Скрыть"}</button><button type="button" className="artistHide" onClick={() => void saveControl("hide_artist", event.track.artists[0], "Исполнитель скрыт из истории.")}>Скрыть исполнителя</button></article>; }) : <article><div><strong>История пока пуста</strong><span>После подключения первый дослушанный трек появится здесь автоматически.</span></div></article>}</div></section>

      <section className="creatorGrid lowerCreatorGrid"><article className="creatorPanel playlistPanel"><header><div><span>плейлист от followtaste</span><h2>Живой плейлист</h2></div><Icon name="playlist" /></header><div><span className="playlistCover"><i /><b>TASTE</b><small>{profile.name}</small></span><div><strong>Вкус {profile.name} — живой</strong><p>Последние {data.playlist.maxTracks} уникальных разрешённых треков. Одна постоянная ссылка для всех фанатов.</p>{data.playlist.url ? <a href={data.playlist.url} target="_blank" rel="noreferrer">Открыть в Яндекс Музыке <Icon name="arrow" /></a> : <span>Плейлист создастся после первой успешной синхронизации.</span>}</div></div><footer><span>{data.playlist.trackCount} треков · версия {data.playlist.revision ?? "—"}</span><em>Обновляется автоматически</em></footer></article><article className="creatorPanel consentPanel"><header><div><span>согласие и данные</span><h2>Ваш контроль</h2></div><Icon name="check" /></header><dl><div><dt>Версия согласия</dt><dd>{data.consentVersion || "не подтверждено"}</dd></div><div><dt>Подтверждено</dt><dd>{data.consentAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.consentAt)) : "—"}</dd></div><div><dt>Состояние</dt><dd>{data.connection.status === "connected" ? "активно" : "ожидает подключения"}</dd></div></dl><button type="button" disabled={data.connection.status !== "connected"} onClick={() => void saveControl("disconnect", undefined, "Яндекс Музыка отключена.")}>Отключить Яндекс Музыку</button><button type="button" className="dangerLink" onClick={() => void saveControl("delete_request", undefined, "Запрос на удаление принят.")}>Запросить удаление данных</button></article></section>

      {editOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setEditOpen(false); }}><section className="workspaceModal profileEditModal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title"><button type="button" onClick={() => setEditOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span>публичная страница</span><h2 id="profile-edit-title">Редактировать профиль</h2><label>Имя<input value={profileDraft.name} maxLength={80} onChange={event => setProfileDraft(value => ({ ...value, name: event.target.value }))} /></label><label>Короткая подпись<input value={profileDraft.roleLine} maxLength={120} placeholder="музыкант · режиссёр" onChange={event => setProfileDraft(value => ({ ...value, roleLine: event.target.value }))} /></label><label>О себе<textarea value={profileDraft.bio} maxLength={500} rows={5} placeholder="Пара строк о себе и своём музыкальном вкусе" onChange={event => setProfileDraft(value => ({ ...value, bio: event.target.value }))} /></label><small>{profileDraft.bio.length} / 500</small><div><button type="button" className="ghostButton" onClick={() => setEditOpen(false)}>Отмена</button><button type="button" className="darkButton" disabled={busy === "profile" || profileDraft.name.trim().length < 2 || profileDraft.roleLine.trim().length < 2} onClick={() => void saveProfile()}>{busy === "profile" ? "Сохраняем…" : "Сохранить"}</button></div></section></div> : null}

      {connectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setConnectOpen(false); setChallenge(null); }} aria-label="Закрыть"><Icon name="x" /></button><span>личный источник истории</span><h2>Подключить вашу Яндекс Музыку</h2>{!challenge ? <><p>Подключите основной аккаунт — тот, где вы реально слушаете треки. Аккаунт <b>followtaste</b> здесь не нужен: он только публикует итоговые плейлисты.</p><div className="consentChecklist"><span><Icon name="check" />Берём только треки из истории прослушиваний</span><span><Icon name="check" />Яндекс добавляет туда трек после полного прослушивания</span><span><Icon name="check" />Доступ можно отключить в любой момент</span></div><button className="darkButton wideButton" type="button" onClick={() => void startConnection()}>{connectionState === "starting" ? "Получаем код…" : "Получить код подключения"}</button></> : <><p>На странице Яндекса выберите ваш основной музыкальный аккаунт, введите код и подтвердите доступ.</p><div className="deviceCode"><small>код подключения</small><strong>{challenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={challenge.verificationUrl} target="_blank" rel="noreferrer">Открыть Яндекс <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения. Это окно можно оставить открытым.</span></div></>}</section></div> : null}
    </>
  );
}
