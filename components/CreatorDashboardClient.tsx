"use client";

import { useEffect, useRef, useState } from "react";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { fullNumber, listeningTime, relativeTime } from "@/lib/format";
import type { CreatorDashboardData } from "@/lib/server/dashboard";

type Challenge = { id: string; userCode: string; verificationUrl: string; expiresAt: string; interval: number };
type ProfileDraft = { name: string; roleLine: string; bio: string };
type Notice = { tone: "success" | "warning" | "error"; text: string } | null;
type ConfirmAction = "disconnect" | null;

const connectionLabels: Record<string, string> = {
  connected: "подключена", pending: "ожидает", error: "ошибка", disconnected: "отключена", not_connected: "не подключена"
};
const visibilityLabels: Record<string, string> = { public: "опубликован", pending: "ожидает", hidden: "скрыт" };
const syncOptions = [
  { value: 60, label: "Как можно быстрее" },
  { value: 300, label: "Не чаще 5 минут" },
  { value: 900, label: "Не чаще 15 минут" },
  { value: 3600, label: "Не чаще раза в час" }
];

function providerErrorLabel(code: string | null) {
  if (!code) return "нет";
  const labels: Record<string, string> = {
    AUTH_EXPIRED: "доступ истёк — переподключите аккаунт",
    AUTH_REVOKED: "доступ отозван — переподключите аккаунт",
    DEVICE_FLOW_EXPIRED: "код подключения истёк",
    RATE_LIMITED: "Яндекс временно ограничил запросы",
    HISTORY_FETCH_FAILED: "историю не удалось получить",
    PLAYLIST_FETCH_FAILED: "плейлист не удалось прочитать",
    PLAYLIST_MUTATION_CONFLICT: "плейлист изменился во время обновления",
    PROVIDER_SCHEMA_CHANGED: "Яндекс изменил формат данных"
  };
  return labels[code] || "неизвестная ошибка — сообщите владельцу";
}
const delayOptions = [
  { value: 0, label: "Без задержки" },
  { value: 3600, label: "Через час" },
  { value: 21600, label: "Через 6 часов" },
  { value: 86400, label: "Через сутки" }
];

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
  const [delay, setDelay] = useState(delayOptions.some(option => option.value === data.publicationDelaySeconds) ? data.publicationDelaySeconds : 0);
  const [syncInterval, setSyncInterval] = useState(data.syncIntervalSeconds);
  const [hidden, setHidden] = useState<string[]>(data.events.filter(event => event.visibility === "hidden").map(event => event.id));
  const [blockedArtists, setBlockedArtists] = useState(data.blockedArtists);
  const [notice, setNotice] = useState<Notice>(null);
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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [comments, setComments] = useState<Record<string, { id: string; body: string } | null>>(() => Object.fromEntries(data.events.map(event => [event.id, event.comment ? { id: event.comment.id, body: event.comment.body } : null])));
  const [commentEditor, setCommentEditor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  useEffect(() => {
    if (!challenge || connectionState !== "waiting") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/creator/music/connect/status/${challenge.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string };
      if (payload.status === "connected") {
        setConnectionState("connected");
        setChallenge(null);
        setConnectOpen(false);
        setNotice({ tone: "success", text: "Яндекс Музыка подключена. История и плейлист будут обновляться автоматически." });
        window.setTimeout(() => window.location.reload(), 900);
      } else if (!response.ok && response.status !== 202) setConnectionState("error");
    }, Math.max(5000, challenge.interval * 1000));
    return () => window.clearInterval(interval);
  }, [challenge, connectionState]);

  async function saveControl(type: string, value?: unknown, successText = "Настройка сохранена.") {
    setBusy(type);
    try {
      const response = await fetch("/api/creator/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, value }) });
      setNotice(response.ok
        ? { tone: "success", text: successText }
        : { tone: "error", text: "Изменение не сохранено. Предыдущее состояние восстановлено — попробуйте ещё раз." });
      return response.ok;
    } catch {
      setNotice({ tone: "error", text: "Нет связи с сервером. Изменение не сохранено — проверьте интернет и повторите." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile() {
    setBusy("profile");
    const response = await fetch("/api/creator/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(profileDraft) });
    setBusy(null);
    if (!response.ok) { setNotice({ tone: "error", text: "Проверьте имя, подпись и описание. Изменения не сохранены." }); return; }
    setProfile(profileDraft);
    setEditOpen(false);
    setNotice({ tone: "success", text: "Публичная страница обновлена." });
  }

  async function startConnection() {
    setConnectionState("starting");
    const response = await fetch("/api/creator/music/connect/start", { method: "POST" });
    const payload = await response.json().catch(() => ({})) as Challenge & { error?: string };
    if (!response.ok) {
      setConnectionState("error");
      setNotice({ tone: "error", text: "Не удалось получить код Яндекса. Подключение не началось — попробуйте ещё раз." });
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
      setNotice({ tone: "success", text: "Фото профиля обновлено." });
    } catch {
      setNotice({ tone: "error", text: "Не удалось загрузить фото. Выберите JPG, PNG или WebP до 10 МБ." });
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    const response = await fetch("/api/creator/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    if (response.ok) { setAvatarUrl(null); setNotice({ tone: "success", text: "Фото удалено. В профиле снова используется фирменный портрет." }); }
    else setNotice({ tone: "error", text: "Не удалось удалить фото. Предыдущее изображение сохранено." });
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${data.slug}`);
      setNotice({ tone: "success", text: "Ссылка для фанатов скопирована." });
    } catch {
      setNotice({ tone: "error", text: "Браузер не разрешил копирование. Откройте публичную страницу и скопируйте адрес вручную." });
    }
  }

  async function hideEvent(id: string) {
    const wasHidden = hidden.includes(id);
    setHidden(wasHidden ? hidden.filter(value => value !== id) : [...hidden, id]);
    const saved = await saveControl(wasHidden ? "restore_event" : "hide_event", id, wasHidden ? "Трек снова опубликован." : "Трек скрыт из профиля и плейлиста.");
    if (!saved) setHidden(current => wasHidden ? [...current, id] : current.filter(value => value !== id));
  }

  async function togglePaused() {
    const previous = paused;
    setPaused(!previous);
    const saved = await saveControl(previous ? "resume" : "pause", undefined, previous ? "Публикация возобновлена." : "Публикация приостановлена.");
    if (!saved) setPaused(previous);
  }

  async function changeDelay(value: number, label: string) {
    const previous = delay;
    setDelay(value);
    const saved = await saveControl("delay", value, value === 0 ? "Новые треки публикуются без задержки." : `Выбрана задержка: ${label.toLowerCase()}.`);
    if (!saved) setDelay(previous);
  }

  async function changeSyncInterval(value: number, label: string) {
    const previous = syncInterval;
    setSyncInterval(value);
    const saved = await saveControl("sync_interval", value, `Частота проверки: ${label.toLowerCase()}.`);
    if (!saved) setSyncInterval(previous);
  }

  async function hideArtist(artist: string) {
    if (blockedArtists.some(item => item.name.trim().toLowerCase() === artist.trim().toLowerCase())) {
      setNotice({ tone: "warning", text: `${artist} уже скрыт правилом.` });
      return;
    }
    const affected = data.events.filter(event => event.track.artists.some(name => name.toLowerCase() === artist.toLowerCase())).map(event => event.id);
    const previous = hidden;
    setHidden(current => [...new Set([...current, ...affected])]);
    const saved = await saveControl("hide_artist", artist, `Исполнитель ${artist} скрыт из истории и плейлиста.`);
    if (saved) setBlockedArtists(current => [...current, { id: `local:${artist.toLowerCase()}`, name: artist }]);
    else setHidden(previous);
  }

  async function restoreArtist(artist: string) {
    const previousArtists = blockedArtists;
    const remainingArtists = blockedArtists.filter(item => item.name.trim().toLowerCase() !== artist.trim().toLowerCase());
    setBlockedArtists(remainingArtists);
    const previousHidden = hidden;
    setHidden(current => current.filter(id => {
      const event = data.events.find(item => item.id === id);
      if (!event || !event.track.artists.some(name => name.trim().toLowerCase() === artist.trim().toLowerCase())) return true;
      if (["hidden_by_creator", "blocked_track"].includes(event.hiddenReason || "")) return true;
      return event.track.artists.some(name => remainingArtists.some(item => item.name.trim().toLowerCase() === name.trim().toLowerCase()));
    }));
    const saved = await saveControl("restore_artist", artist, `Исполнитель ${artist} снова может появляться в истории.`);
    if (!saved) {
      setBlockedArtists(previousArtists);
      setHidden(previousHidden);
    }
  }

  async function confirmDestructiveAction() {
    const action = confirmAction;
    if (!action) return;
    const saved = await saveControl(action, undefined, "Яндекс Музыка отключена.");
    if (saved) setConfirmAction(null);
  }

  function editComment(eventId: string) {
    setCommentEditor(eventId);
    setCommentDraft(comments[eventId]?.body || "");
  }

  async function saveComment(eventId: string) {
    const body = commentDraft.trim();
    if (!body) return;
    setBusy("comment_event");
    const response = await fetch("/api/creator/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "comment_event", value: { eventId, body } }) });
    const payload = await response.json().catch(() => ({})) as { result?: { comment?: { id: string; body: string } } };
    setBusy(null);
    if (!response.ok || !payload.result?.comment) return setNotice({ tone: "error", text: "Комментарий не сохранён. Попробуйте ещё раз." });
    setComments(current => ({ ...current, [eventId]: payload.result!.comment! }));
    setCommentEditor(null);
    setNotice({ tone: "success", text: "Комментарий появился на публичной странице. Подписчики в Telegram получат его автоматически." });
  }

  async function deleteComment(eventId: string) {
    const comment = comments[eventId];
    if (!comment) return;
    const saved = await saveControl("delete_comment", comment.id, "Комментарий удалён.");
    if (saved) { setComments(current => ({ ...current, [eventId]: null })); setCommentEditor(null); }
  }

  const connectionStatus = connectionState === "connected" ? "connected" : connectionState === "error" ? "error" : data.connection.status;

  return (
    <>
      <header className="workspaceTopbar creatorTopbar"><div><span>кабинет Саундмейкера · {profile.name}</span><h1>Страница вашей истории</h1></div><button type="button" className={`pauseButton ${paused ? "resume" : ""}`} disabled={busy === "pause" || busy === "resume"} onClick={() => void togglePaused()}><Icon name={paused ? "play" : "pause"} />{busy === "pause" || busy === "resume" ? "Сохраняем…" : paused ? "Возобновить публикацию" : "Поставить на паузу"}</button></header>
      {notice ? <div className={`workspaceNotice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}><Icon name={notice.tone === "success" ? "check" : "shield"} /><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Закрыть"><Icon name="x" size={17} /></button></div> : null}
      {paused ? <section className="pauseBanner"><Icon name="pause" size={30} /><div><strong>Публикация на паузе</strong><p>Новые события не публикуются, плейлист не меняется. Всё уже опубликованное сохранено. Возобновить можно кнопкой выше.</p></div></section> : null}

      <section className="creatorIdentityCard" aria-label="Публичный профиль"><ProfilePortrait compact name={profile.name} avatarUrl={avatarUrl} /><div><span>публичная страница</span><strong>{profile.name}</strong><small>{profile.roleLine}{profile.bio ? ` · ${profile.bio}` : ""}</small></div><div className="creatorIdentityActions"><button className="darkButton" type="button" onClick={() => { setProfileDraft(profile); setEditOpen(true); }}><Icon name="settings" />Редактировать страницу</button><button className="ghostButton" type="button" onClick={() => void copyProfileLink()}><Icon name="copy" />Скопировать ссылку</button></div></section>

      <section className="creatorMetrics"><article><span>следят за вкусом</span><strong>{fullNumber(data.followerCount)}</strong><em>{data.telegramSubscriberCount} получают сводку в Telegram</em></article><article><span>просмотры · 7 дней</span><strong>{fullNumber(data.profileViews7d)}</strong><em>{fullNumber(data.uniqueVisitors7d)} уникальных</em></article><article><span>открыли трек · 7 дней</span><strong>{fullNumber(data.trackOpens7d)}</strong><em>переходы, не прослушивания</em></article><article><span>живой плейлист</span><strong>{data.playlist.trackCount} <small>/ {data.playlist.maxTracks}</small></strong><em>{data.playlist.lastSyncAt ? `обновлён ${relativeTime(data.playlist.lastSyncAt)}` : "создастся автоматически"}</em></article></section>

      <section className="creatorGrid">
        <article className="creatorPanel connectionPanel" id="connection"><header><div><span>источник истории</span><h2>Личная Яндекс Музыка</h2></div><span className={`statusTag status-${connectionStatus === "connected" ? "active" : connectionStatus}`}><i />{connectionLabels[connectionStatus] || "не подключена"}</span></header><div className="accountCard"><span className="yandexAvatar">Я</span><div><strong>{data.connection.login || "Аккаунт не подключён"}</strong><small>{data.connection.accountIdSuffix ? `Источник истории · ID •••• ${data.connection.accountIdSuffix}` : "Подключите аккаунт, в котором слушаете музыку"}</small></div><button type="button" onClick={() => setConnectOpen(true)}>{data.connection.status === "connected" ? "Переподключить" : "Подключить"}</button></div><dl><div><dt>Последняя проверка</dt><dd>{data.connection.lastSuccessAt ? relativeTime(data.connection.lastSuccessAt) : "ещё не было"}</dd></div><div><dt>Срок доступа</dt><dd>{expiresLabel(data.connection.expiresAt)}</dd></div><div><dt>Последняя ошибка</dt><dd>{providerErrorLabel(data.connection.errorCode)}</dd></div><div><dt>Что попадает в Taste</dt><dd>треки, которые Яндекс считает дослушанными до конца</dd></div></dl><div className="syncIntervalControl"><span>Частота проверки истории</span><div>{syncOptions.map(option => <button type="button" disabled={busy === "sync_interval"} className={syncInterval === option.value ? "active" : ""} key={option.value} onClick={() => void changeSyncInterval(option.value, option.label)}>{option.label}</button>)}</div><small>Планировщик проверяет возможность запуска каждую минуту. Выбранная частота задаёт минимальный интервал для этого профиля, а появление трека всё равно зависит от Яндекса.</small></div><footer><span><Icon name="lock" />Проверка и обновление плейлиста идут автоматически. Доступ хранится в зашифрованном виде.</span></footer></article>

        <article className="creatorPanel privacyPanel" id="privacy"><header><div><span>управление публикацией</span><h2>Что видят фанаты</h2></div><Icon name="shield" /></header><div className="publicationDefault"><Icon name="pulse" /><div><strong>{delay === 0 ? "Публикация без задержки" : "Публикация с задержкой"}</strong><small>Общую публикацию можно остановить кнопкой «Поставить на паузу» вверху.</small></div></div><div className="delayControl"><span>Задержка новых треков</span><div>{delayOptions.map(option => <button disabled={busy === "delay"} className={delay === option.value ? "active" : ""} type="button" key={option.value} onClick={() => void changeDelay(option.value, option.label)}>{option.label}</button>)}</div></div><div className="privacyCounts"><div><span>Скрытые события</span><strong>{hidden.length}</strong></div><div><span>Скрытые исполнители</span><strong>{blockedArtists.length}</strong></div></div>{blockedArtists.length ? <div className="blockedArtistList"><span>Не показывать этих исполнителей</span>{blockedArtists.map(artist => <div key={artist.id}><strong>{artist.name}</strong><button type="button" disabled={busy === "restore_artist"} onClick={() => void restoreArtist(artist.name)}>Вернуть</button></div>)}</div> : null}<p><Icon name="clock" />Скрытие сразу убирает трек со страницы и при ближайшем обновлении — из плейлиста.</p></article>
      </section>

      <section className="creatorPanel historyPanel" id="history"><header><div><h2>История прослушиваний</h2><small>Скройте трек или оставьте к нему короткий комментарий для подписчиков.</small></div></header><div className="creatorEventList">{data.events.length ? data.events.map(event => { const isHidden = hidden.includes(event.id); const hiddenByArtist = isHidden && event.track.artists.some(name => blockedArtists.some(item => item.name.trim().toLowerCase() === name.trim().toLowerCase())); const comment = comments[event.id]; return <article key={event.id} className={`${isHidden ? "eventHidden " : ""}${event.track.coverUrl ? "" : "noArtwork"}`}><span className="creatorEventArtwork"><CoverArt url={event.track.coverUrl} title={event.track.title} size="small" /></span><div className="creatorEventTrack"><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span>{comment ? <blockquote>«{comment.body}»</blockquote> : null}</div><time>{listeningTime(event)}</time><span className={`visibilityBadge ${isHidden ? "hidden" : event.visibility}`}><i />{hiddenByArtist ? "скрыт правилом" : isHidden ? "скрыт Саундмейкером" : visibilityLabels[event.visibility]}</span><div className="creatorEventActions"><button type="button" className="commentAction" disabled={isHidden} onClick={() => editComment(event.id)}><Icon name="spark" size={15} />{comment ? "Изменить комментарий" : "Прокомментировать"}</button><button type="button" disabled={hiddenByArtist || busy === "hide_event" || busy === "restore_event"} onClick={() => void hideEvent(event.id)}>{hiddenByArtist ? "Правило выше" : isHidden ? "Вернуть" : "Скрыть трек"}</button><button type="button" className="artistHide" disabled={busy === "hide_artist" || hiddenByArtist || !event.track.artists[0]} onClick={() => void hideArtist(event.track.artists[0])}>{hiddenByArtist ? "Исполнитель скрыт" : "Скрыть исполнителя"}</button></div>{commentEditor === event.id ? <div className="commentEditor"><label htmlFor={`comment-${event.id}`}>Что хотите сказать об этом треке?</label><textarea id={`comment-${event.id}`} autoFocus maxLength={600} rows={3} value={commentDraft} onChange={value => setCommentDraft(value.target.value)} placeholder="Например: возвращаюсь к этому припеву весь вечер" /><small>{commentDraft.length} / 600</small><div>{comment ? <button type="button" className="commentDelete" disabled={busy === "delete_comment"} onClick={() => void deleteComment(event.id)}>Удалить</button> : <span />}<button type="button" onClick={() => setCommentEditor(null)}>Отмена</button><button type="button" className="darkButton" disabled={!commentDraft.trim() || busy === "comment_event"} onClick={() => void saveComment(event.id)}>{busy === "comment_event" ? "Публикуем…" : "Опубликовать"}</button></div></div> : null}</article>; }) : <article><div><strong>История пока пуста</strong><span>После подключения первая запись из истории Яндекс Музыки появится здесь автоматически.</span></div></article>}</div></section>

      <section className="creatorGrid lowerCreatorGrid"><article className="creatorPanel playlistPanel"><header><div><span>плейлист в аккаунте followtaste</span><h2>Живой плейлист</h2></div><Icon name="playlist" /></header><div><div><strong>Вкус {profile.name} — живой</strong><p>Последние {data.playlist.maxTracks} уникальных разрешённых треков. Повторы считаются на вашей странице, но не дублируются в плейлисте.</p>{data.playlist.url ? <a href={data.playlist.url} target="_blank" rel="noreferrer">Открыть в Яндекс Музыке <Icon name="arrow" /></a> : <span>Плейлист создастся автоматически после первой записи в истории.</span>}</div></div><footer><span>{data.playlist.trackCount} треков · версия {data.playlist.revision ?? "—"}</span><em>Обновляется автоматически</em></footer></article><article className="creatorPanel consentPanel"><header><div><span>согласие и данные</span><h2>Ваш контроль</h2></div><Icon name="check" /></header><dl><div><dt>Версия согласия</dt><dd>{data.consentVersion || "не подтверждено"}</dd></div><div><dt>Подтверждено</dt><dd>{data.consentAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.consentAt)) : "—"}</dd></div><div><dt>Состояние</dt><dd>{data.connection.status === "connected" ? "активно" : "ожидает подключения"}</dd></div></dl><button type="button" disabled={data.connection.status !== "connected"} onClick={() => setConfirmAction("disconnect")}>Отключить Яндекс Музыку</button><p>Если потребуется удалить профиль и данные, напишите владельцу лично или на camp@navumi.com.</p></article></section>

      {confirmAction ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !busy) setConfirmAction(null); }}><section className="workspaceModal confirmModal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title"><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmAction(null)} aria-label="Закрыть"><Icon name="x" /></button><span className="confirmModalIcon"><Icon name="shield" size={28} /></span><span>действие требует подтверждения</span><h2 id="confirm-action-title">Отключить историю?</h2><p>Taste перестанет получать новые записи и обновлять плейлист. Уже опубликованные треки останутся видимыми, пока владелец не удалит профиль.</p><div><button type="button" className="ghostButton" disabled={Boolean(busy)} onClick={() => setConfirmAction(null)}>Отмена</button><button type="button" className="dangerButton" disabled={Boolean(busy)} onClick={() => void confirmDestructiveAction()}>{busy ? "Выполняем…" : "Да, отключить"}</button></div></section></div> : null}

      {editOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setEditOpen(false); }}><section className="workspaceModal profileEditModal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title"><button type="button" onClick={() => setEditOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span>публичная страница</span><h2 id="profile-edit-title">Редактировать страницу</h2><div className="profilePhotoEditor"><ProfilePortrait compact name={profile.name} avatarUrl={avatarUrl} /><div><strong>Фотография</strong><small>Квадратное изображение будет подготовлено автоматически.</small><label className="ghostButton">{avatarBusy ? "Обрабатываем…" : avatarUrl ? "Заменить фотографию" : "Загрузить фотографию"}<input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></label>{avatarUrl ? <button className="identityRemove" type="button" disabled={avatarBusy} onClick={() => void removeAvatar()}>Удалить фотографию</button> : null}</div></div><label>Имя<input value={profileDraft.name} maxLength={80} onChange={event => setProfileDraft(value => ({ ...value, name: event.target.value }))} /></label><label>Короткая подпись<input value={profileDraft.roleLine} maxLength={120} placeholder="музыкант · режиссёр" onChange={event => setProfileDraft(value => ({ ...value, roleLine: event.target.value }))} /></label><label>О себе<textarea value={profileDraft.bio} maxLength={500} rows={5} placeholder="Пара строк о себе и своём музыкальном вкусе" onChange={event => setProfileDraft(value => ({ ...value, bio: event.target.value }))} /></label><small>{profileDraft.bio.length} / 500</small><div><button type="button" className="ghostButton" onClick={() => setEditOpen(false)}>Отмена</button><button type="button" className="darkButton" disabled={busy === "profile" || profileDraft.name.trim().length < 2 || profileDraft.roleLine.trim().length < 2} onClick={() => void saveProfile()}>{busy === "profile" ? "Сохраняем…" : "Сохранить изменения"}</button></div></section></div> : null}

      {connectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal"><button type="button" onClick={() => { setConnectOpen(false); setChallenge(null); }} aria-label="Закрыть"><Icon name="x" /></button><span>личный источник истории</span><h2>Подключить вашу Яндекс Музыку</h2>{!challenge ? <><p>Подключите основной аккаунт — тот, где вы действительно слушаете треки. Аккаунт <b>followtaste</b> здесь не нужен: он только публикует итоговые плейлисты.</p><div className="consentChecklist"><span><Icon name="check" />Берём только треки, которые Яндекс уже добавил в историю</span><span><Icon name="check" />По правилам Яндекса туда попадают композиции, дослушанные до конца</span><span><Icon name="check" />Не придумываем точное время, если Яндекс отдаёт только день и порядок</span><span><Icon name="check" />Доступ можно отключить в любой момент</span></div><button className="darkButton wideButton" type="button" onClick={() => void startConnection()}>{connectionState === "starting" ? "Получаем код…" : "Получить код подключения"}</button></> : <><p>На странице Яндекса выберите ваш основной музыкальный аккаунт, введите код и подтвердите доступ.</p><div className="deviceCode"><small>код подключения</small><strong>{challenge.userCode}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.userCode)}><Icon name="copy" />Копировать</button></div><a className="darkButton wideButton" href={challenge.verificationUrl} target="_blank" rel="noreferrer">Открыть Яндекс <Icon name="arrow" /></a><div className="waitingState"><i /><span>Ждём подтверждения. Это окно можно оставить открытым.</span></div></>}</section></div> : null}
    </>
  );
}
