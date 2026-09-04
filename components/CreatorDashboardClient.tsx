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

function imageFromFile(file: File) {
  return new Promise<{ image: HTMLImageElement; release: () => void }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("IMAGE_DECODE_FAILED")); };
    image.src = url;
  });
}

async function prepareSquareAvatar(file: File) {
  const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!looksLikeImage || file.size < 100 || file.size > 15_000_000) throw new Error("INVALID_IMAGE");
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  let release: () => void = () => undefined;
  try {
    if (typeof createImageBitmap !== "function") throw new Error("IMAGE_BITMAP_UNAVAILABLE");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } catch {
    const decoded = await imageFromFile(file);
    source = decoded.image;
    width = decoded.image.naturalWidth;
    height = decoded.image.naturalHeight;
    release = decoded.release;
  }
  if (!width || !height) { release(); throw new Error("IMAGE_DECODE_FAILED"); }
  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) { release(); throw new Error("CANVAS_UNAVAILABLE"); }
  const scale = Math.max(size / width, size / height);
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  context.drawImage(source, (size - outputWidth) / 2, (size - outputHeight) / 2, outputWidth, outputHeight);
  release();
  let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .86));
  if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .88));
  if (!blob) throw new Error("IMAGE_PROCESSING_FAILED");
  return new File([blob], blob.type === "image/webp" ? "taste-avatar.webp" : "taste-avatar.jpg", { type: blob.type });
}

export function CreatorDashboardClient({ initialData, showOnboarding = false }: { initialData: CreatorDashboardData | null; showOnboarding?: boolean }) {
  if (!initialData) return <section className="workspaceEmpty"><Icon name="users" /><h1>Профиль ещё не назначен</h1><p>Откройте персональную ссылку-приглашение, которую прислал владелец Taste.</p></section>;
  return <CreatorDashboard data={initialData} showOnboarding={showOnboarding} />;
}

function CreatorDashboard({ data, showOnboarding }: { data: CreatorDashboardData; showOnboarding: boolean }) {
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
  const connectionCheckInFlight = useRef(false);
  const connectionCodeInput = useRef<HTMLInputElement>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(showOnboarding ? 0 : null);

  async function checkConnection(target: Challenge) {
    if (connectionCheckInFlight.current) return;
    connectionCheckInFlight.current = true;
    try {
      const response = await fetch(`/api/creator/music/connect/status/${target.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { status?: string; error?: string };
      if (payload.status === "connected") {
        setConnectionState("connected");
        setChallenge(null);
        setConnectOpen(false);
        setNotice({ tone: "success", text: "Яндекс Музыка подключена. История и плейлист будут обновляться автоматически." });
        window.setTimeout(() => window.location.assign("/creator#history"), 900);
      } else if (!response.ok && response.status !== 202) {
        setConnectionState("error");
        setChallenge(null);
        setNotice({ tone: "error", text: response.status === 410 || payload.error === "DEVICE_FLOW_EXPIRED" ? "Код подключения истёк. Получите новый код — кабинет и приглашение уже сохранены." : "Яндекс пока не подтвердил подключение. Получите новый код и попробуйте ещё раз." });
      }
    } finally {
      connectionCheckInFlight.current = false;
    }
  }

  function rememberOnboarding() {
    void fetch("/api/creator/onboarding", { method: "POST", keepalive: true }).catch(() => undefined);
    window.history.replaceState(null, "", "/creator");
  }

  function finishOnboarding(openConnection: boolean) {
    setOnboardingStep(null);
    rememberOnboarding();
    if (openConnection && data.connection.status !== "connected") setConnectOpen(true);
    else if (openConnection) {
      setProfileDraft(profile);
      setEditOpen(true);
    }
  }

  async function copyConnectionCode() {
    if (!challenge) return;
    const input = connectionCodeInput.current;
    let copied = false;
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
      input.setSelectionRange(0, input.value.length);
      try { copied = document.execCommand("copy"); } catch { copied = false; }
    }
    if (!copied && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(challenge.userCode); copied = true; } catch { copied = false; }
    }
    setCodeCopied(copied);
    setNotice(copied
      ? { tone: "success", text: "Код скопирован. Теперь откройте Яндекс и вставьте его." }
      : { tone: "warning", text: "Код выделен. Выберите «Скопировать» в меню браузера, затем откройте Яндекс." });
  }

  useEffect(() => {
    if (!challenge || connectionState !== "waiting") return;
    const check = () => void checkConnection(challenge);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") check(); };
    const interval = window.setInterval(check, Math.max(5000, challenge.interval * 1000));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibilityChange);
    check();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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
    setNotice(null);
    setCodeCopied(false);
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
      setNotice({ tone: "error", text: "Не удалось подготовить фото. Выберите снимок из медиатеки в JPG, PNG, WebP или HEIC до 15 МБ." });
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
    if (commentEditor === eventId) {
      setCommentEditor(null);
      setCommentDraft("");
      return;
    }
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
  const onboardingSlides = [
    { label: "добро пожаловать в Taste", title: `${profile.name}, это ваша музыкальная страница`, text: "Покажем главное за минуту. Эти подсказки появятся только сейчас — дальше вас встретит обычный кабинет.", icon: "spark" as const },
    { label: "01 / 03 · источник истории", title: "Подключите аккаунт, где слушаете музыку", text: "Яндекс попросит отдельное подтверждение. После него новые записи будут автоматически появляться в Taste и живом плейлисте.", icon: "music" as const },
    { label: "02 / 03 · ваша страница", title: "Добавьте фото и проверьте подпись", text: "Квадратное фото, короткое представление и пара строк о себе помогут слушателям понять, чей вкус они открывают.", icon: "user" as const },
    { label: "03 / 03 · ссылка для слушателей", title: "Поделитесь одной постоянной ссылкой", text: "По ней фанаты увидят вашу историю, подпишутся и откроют плейлист в Яндекс Музыке. Ссылку всегда можно скопировать в кабинете.", icon: "share" as const }
  ];
  const onboardingSlide = onboardingStep === null ? null : onboardingSlides[onboardingStep];

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

      <section className="creatorPanel historyPanel" id="history"><header><div><h2>История прослушиваний</h2><small>В блоке помещается до десяти строк. Более ранние треки доступны прокруткой внутри списка.</small></div></header><div className="creatorEventList creatorEventListScrollable" tabIndex={0} aria-label="Прокручиваемая история прослушиваний">{data.events.length ? data.events.map(event => { const isHidden = hidden.includes(event.id); const hiddenByArtist = isHidden && event.track.artists.some(name => blockedArtists.some(item => item.name.trim().toLowerCase() === name.trim().toLowerCase())); const comment = comments[event.id]; const commentOpen = commentEditor === event.id; const commentActionLabel = commentOpen ? "Закрыть поле комментария" : comment ? "Изменить комментарий" : "Прокомментировать"; const trackActionLabel = hiddenByArtist ? "Трек скрыт вместе с исполнителем" : isHidden ? "Вернуть трек" : "Скрыть трек"; const artistActionLabel = hiddenByArtist ? "Исполнитель уже скрыт" : `Скрыть исполнителя ${event.track.artists[0] || ""}`.trim(); return <article key={event.id} className={`${isHidden ? "eventHidden " : ""}${event.track.coverUrl ? "" : "noArtwork"}`}><span className="creatorEventArtwork"><CoverArt url={event.track.coverUrl} title={event.track.title} size="small" /></span><div className="creatorEventTrack"><strong>{event.track.title}</strong><span>{event.track.artists.join(", ")}</span>{comment ? <blockquote>«{comment.body}»</blockquote> : null}</div><time>{listeningTime(event)}</time><span className={`visibilityBadge ${isHidden ? "hidden" : event.visibility}`}><i />{hiddenByArtist ? "скрыт правилом" : isHidden ? "скрыт Саундмейкером" : visibilityLabels[event.visibility]}</span><div className="creatorEventActions" role="group" aria-label={`Действия с треком ${event.track.title}`}><button type="button" className={`eventIconButton commentAction ${comment ? "hasComment" : ""}`} aria-label={commentActionLabel} title={commentActionLabel} aria-expanded={commentOpen} aria-controls={`comment-${event.id}`} disabled={isHidden} onClick={() => editComment(event.id)}><Icon name="comment" size={23} /></button><button type="button" className={`eventIconButton trackVisibilityAction ${isHidden && !hiddenByArtist ? "isActive" : ""}`} aria-label={trackActionLabel} title={trackActionLabel} aria-pressed={isHidden} disabled={hiddenByArtist || busy === "hide_event" || busy === "restore_event"} onClick={() => void hideEvent(event.id)}><Icon name={isHidden && !hiddenByArtist ? "eye" : "eyeOff"} size={23} /></button><button type="button" className="eventIconButton artistHide" aria-label={artistActionLabel} title={artistActionLabel} aria-pressed={hiddenByArtist} disabled={busy === "hide_artist" || hiddenByArtist || !event.track.artists[0]} onClick={() => void hideArtist(event.track.artists[0])}><Icon name="userOff" size={23} /></button></div>{commentOpen ? <div className="commentEditor"><label htmlFor={`comment-${event.id}`}>Что хотите сказать об этом треке?</label><textarea id={`comment-${event.id}`} autoFocus maxLength={600} rows={3} value={commentDraft} onChange={value => setCommentDraft(value.target.value)} placeholder="Например: возвращаюсь к этому припеву весь вечер" /><small>{commentDraft.length} / 600</small><div>{comment ? <button type="button" className="commentDelete" disabled={busy === "delete_comment"} onClick={() => void deleteComment(event.id)}>Удалить</button> : <span />}<button type="button" onClick={() => setCommentEditor(null)}>Отмена</button><button type="button" className="darkButton" disabled={!commentDraft.trim() || busy === "comment_event"} onClick={() => void saveComment(event.id)}>{busy === "comment_event" ? "Публикуем…" : "Опубликовать"}</button></div></div> : null}</article>; }) : <article><div><strong>История пока пуста</strong><span>После подключения первая запись из истории Яндекс Музыки появится здесь автоматически.</span></div></article>}</div></section>

      <section className="creatorGrid lowerCreatorGrid"><article className="creatorPanel playlistPanel"><header><div><span>плейлист в аккаунте followtaste</span><h2>Живой плейлист</h2></div><Icon name="playlist" /></header><div><div><strong>Вкус {profile.name} — живой</strong><p>Последние {data.playlist.maxTracks} уникальных разрешённых треков. Повторы считаются на вашей странице, но не дублируются в плейлисте.</p>{data.playlist.url ? <a href={data.playlist.url} target="_blank" rel="noreferrer">Открыть в Яндекс Музыке <Icon name="arrow" /></a> : <span>Плейлист создастся автоматически после первой записи в истории.</span>}</div></div><footer><span>{data.playlist.trackCount} треков · версия {data.playlist.revision ?? "—"}</span><em>Обновляется автоматически</em></footer></article><article className="creatorPanel consentPanel"><header><div><span>согласие и данные</span><h2>Ваш контроль</h2></div><Icon name="check" /></header><dl><div><dt>Версия согласия</dt><dd>{data.consentVersion || "не подтверждено"}</dd></div><div><dt>Подтверждено</dt><dd>{data.consentAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.consentAt)) : "—"}</dd></div><div><dt>Состояние</dt><dd>{data.connection.status === "connected" ? "активно" : "ожидает подключения"}</dd></div></dl><button type="button" disabled={data.connection.status !== "connected"} onClick={() => setConfirmAction("disconnect")}>Отключить Яндекс Музыку</button><p>Если потребуется удалить профиль и данные, напишите владельцу лично или на camp@navumi.com.</p></article></section>

      {onboardingSlide ? <div className="modalBackdrop onboardingBackdrop"><section className="workspaceModal onboardingModal" role="dialog" aria-modal="true" aria-labelledby="creator-onboarding-title"><button type="button" onClick={() => finishOnboarding(false)} aria-label="Закрыть подсказки"><Icon name="x" /></button><div className="onboardingProgress" aria-label={`Шаг ${onboardingStep! + 1} из ${onboardingSlides.length}`}>{onboardingSlides.map((_, index) => <i className={index <= onboardingStep! ? "active" : ""} key={index} />)}</div><span>{onboardingSlide.label}</span><span className="onboardingIcon"><Icon name={onboardingSlide.icon} size={30} /></span><h2 id="creator-onboarding-title">{onboardingSlide.title}</h2><p>{onboardingSlide.text}</p><div className="onboardingActions"><button type="button" className="onboardingSkip" onClick={() => finishOnboarding(false)}>Пропустить</button>{onboardingStep! > 0 ? <button type="button" className="ghostButton" onClick={() => setOnboardingStep(onboardingStep! - 1)}>Назад</button> : null}{onboardingStep! < onboardingSlides.length - 1 ? <button type="button" className="darkButton" onClick={() => setOnboardingStep(onboardingStep! + 1)}>Дальше <Icon name="arrow" /></button> : <button type="button" className="darkButton" onClick={() => finishOnboarding(true)}>{data.connection.status === "connected" ? "Настроить страницу" : "Подключить музыку"} <Icon name="arrow" /></button>}</div></section></div> : null}

      {confirmAction ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !busy) setConfirmAction(null); }}><section className="workspaceModal confirmModal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title"><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmAction(null)} aria-label="Закрыть"><Icon name="x" /></button><span className="confirmModalIcon"><Icon name="shield" size={28} /></span><span>действие требует подтверждения</span><h2 id="confirm-action-title">Отключить историю?</h2><p>Taste перестанет получать новые записи и обновлять плейлист. Уже опубликованные треки останутся видимыми, пока владелец не удалит профиль.</p><div><button type="button" className="ghostButton" disabled={Boolean(busy)} onClick={() => setConfirmAction(null)}>Отмена</button><button type="button" className="dangerButton" disabled={Boolean(busy)} onClick={() => void confirmDestructiveAction()}>{busy ? "Выполняем…" : "Да, отключить"}</button></div></section></div> : null}

      {editOpen ? <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setEditOpen(false); }}><section className="workspaceModal profileEditModal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title"><button type="button" onClick={() => setEditOpen(false)} aria-label="Закрыть"><Icon name="x" /></button><span>публичная страница</span><h2 id="profile-edit-title">Редактировать страницу</h2><div className="profilePhotoEditor"><ProfilePortrait compact name={profile.name} avatarUrl={avatarUrl} /><div><strong>Фотография</strong><small>Фото из медиатеки автоматически обрежется до квадрата. Поддерживаются в том числе снимки iPhone.</small><label className="ghostButton">{avatarBusy ? "Готовим фото…" : avatarUrl ? "Заменить фотографию" : "Загрузить фотографию"}<input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={avatarBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></label>{avatarUrl ? <button className="identityRemove" type="button" disabled={avatarBusy} onClick={() => void removeAvatar()}>Удалить фотографию</button> : null}</div></div><label>Имя<input value={profileDraft.name} maxLength={80} onChange={event => setProfileDraft(value => ({ ...value, name: event.target.value }))} /></label><label>Короткая подпись<input value={profileDraft.roleLine} maxLength={120} placeholder="музыкант · режиссёр" onChange={event => setProfileDraft(value => ({ ...value, roleLine: event.target.value }))} /></label><label>О себе<textarea value={profileDraft.bio} maxLength={500} rows={5} placeholder="Пара строк о себе и своём музыкальном вкусе" onChange={event => setProfileDraft(value => ({ ...value, bio: event.target.value }))} /></label><small>{profileDraft.bio.length} / 500</small><div><button type="button" className="ghostButton" onClick={() => setEditOpen(false)}>Отмена</button><button type="button" className="darkButton" disabled={busy === "profile" || profileDraft.name.trim().length < 2 || profileDraft.roleLine.trim().length < 2} onClick={() => void saveProfile()}>{busy === "profile" ? "Сохраняем…" : "Сохранить изменения"}</button></div></section></div> : null}

      {connectOpen ? <div className="modalBackdrop"><section className="workspaceModal deviceModal" role="dialog" aria-modal="true" aria-labelledby="music-connect-title"><button type="button" onClick={() => { setConnectOpen(false); setChallenge(null); setCodeCopied(false); }} aria-label="Закрыть"><Icon name="x" /></button><span>личный источник истории</span><h2 id="music-connect-title">Подключить вашу Яндекс Музыку</h2>{!challenge ? <><p>Подключите основной аккаунт — тот, где вы действительно слушаете треки. Аккаунт <b>followtaste</b> здесь не нужен: он только публикует итоговые плейлисты.</p><div className="consentChecklist"><span><Icon name="check" />Берём только треки, которые Яндекс уже добавил в историю</span><span><Icon name="check" />По правилам Яндекса туда попадают композиции, дослушанные до конца</span><span><Icon name="check" />Не придумываем точное время, если Яндекс отдаёт только день и порядок</span><span><Icon name="check" />Доступ можно отключить в любой момент</span></div><button className="darkButton wideButton" type="button" disabled={connectionState === "starting"} onClick={() => void startConnection()}>{connectionState === "starting" ? "Получаем код…" : connectionState === "error" ? "Получить новый код" : "Продолжить подключение"}</button></> : <><p>Сначала скопируйте код, затем откройте Яндекс. Такой порядок одинаково работает в Safari, Chrome и мобильных браузерах.</p><div className={`deviceCode ${codeCopied ? "isCopied" : ""}`}><label htmlFor="music-device-code">код подключения</label><input ref={connectionCodeInput} id="music-device-code" readOnly value={challenge.userCode} inputMode="none" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyConnectionCode()}><Icon name={codeCopied ? "check" : "copy"} />{codeCopied ? "Скопирован" : "Копировать"}</button></div><div className="deviceConnectionActions"><button className="darkButton wideButton" type="button" onClick={() => void copyConnectionCode()}><Icon name={codeCopied ? "check" : "copy"} />{codeCopied ? "Код скопирован" : "Скопировать код"}</button><a className="connectionExternalLink" href={challenge.verificationUrl} target="_blank" rel="noreferrer" onClick={() => { if (!codeCopied) void copyConnectionCode(); }}>Открыть Яндекс <Icon name="arrow" /></a></div><small className="mobileConnectionHint">На телефоне вставьте код в открывшееся поле Яндекса, подтвердите доступ и вернитесь в эту вкладку Taste.</small><div className="waitingState"><i /><span>После возврата кабинет сам проверит подключение.</span></div><button type="button" className="connectionCheckButton" onClick={() => void checkConnection(challenge)}>Я подтвердил доступ — проверить</button></>}</section></div> : null}
    </>
  );
}
