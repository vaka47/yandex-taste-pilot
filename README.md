# Тейст — пилот для Яндекс Музыки

Production-oriented pilot for following the real, opt-in listening history of tastemakers. The web app is the measurement layer; one stable Yandex Music playlist per tastemaker is the delivery layer.

## Implemented

- public profile at `/t/[slug]` with identity, aggregate activity and a protected-history teaser for an anonymous visitor; no track identity is returned before Yandex ID unlocks the full 30-day history, repeats and discoveries, and login never silently creates a follow;
- Follow → official Yandex ID OAuth + PKCE → atomic pending-follow completion;
- secure `HttpOnly` sessions and DB-backed roles;
- one-use, seven-day creator invites issued only by the owner admin; successful registration burns every outstanding invite for that tastemaker, while ordinary Yandex ID sign-in always remains a fan account;
- creator invite claim, consent, pause/resume, publication delay, hide track/artist, disconnect and deletion request;
- creator-editable name, role line, bio and optional square avatar; avatar download is shown only to the authenticated owner on the public profile;
- operational admin actions, automation/sync/audit logs, per-tastemaker profile/auth/follow/music/Telegram/share analytics and CSV export;
- tracked `/go/track/[id]` and `/go/playlist/[id]` redirects with an allowlisted Yandex destination;
- PostgreSQL migration and idempotent schema bootstrap;
- isolated FastAPI connector pinned to `yandex-music==3.0.0`;
- non-blocking Device Flow challenge/polling; music tokens never reach browser storage;
- real history import, privacy filtering, stable deduplication, zero delay by default and optional 24h publication delay;
- one chained history → latest-50 unique playlist sync through a dedicated service account, connected from the protected admin UI;
- fastest publication by default: a 60-second sync preference, opportunistic checks when an active public profile or creator cabinet opens, and immediate playlist delivery after every successful history import; creators may switch to 5/15/60-minute checks;
- cron leases, normalized provider errors and per-tastemaker failure isolation;
- opt-in Telegram bot linking per followed tastemaker, at most one digest per Moscow calendar day per tastemaker, tracked playlist links, blocked-bot handling and delivery export;
- responsive public, admin and creator interfaces, reduced-motion support and visible keyboard focus;
- fixture mode for safe demos before accounts/secrets are connected.

## Important truth boundary

Тейст не решает, после скольких секунд трек считается прослушанным. Официальная справка Яндекс Музыки говорит, что история хранит треки, прослушанные до конца за последние 10 дней. Доступный коннектор не отдаёт процент, число секунд или событие на отметке 50%, поэтому Тейст не может самостоятельно принять пятисекундный или наполовину прослушанный трек. Как только запись становится доступна в истории Яндекса, ближайшая проверка Тейста переносит её в профиль и живой плейлист. Интерфейс возвращает надёжные день и порядок записей, но не гарантирует точное время каждого прослушивания; поэтому коннектор передаёт `observedAt: null`, когда известны только день и порядок. Продукт не должен придумывать секундную точность.

`track_open_click` is **music intent**, not a stream. The product never claims playback started or finished.

## Local web app

```bash
cp .env.example .env.local
npm install
npm run migrate
npm run dev
```

Without `DATABASE_URL`, the app intentionally opens in fixture mode. Check `/api/health` for readiness.

## Local connector

```bash
cd music-connector
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
INTERNAL_SECRET=local-secret uvicorn app.main:app --port 8000
```

The connector has no public docs endpoint and protects every `/internal/*` route with `X-Internal-Secret`.

## Production topology

Deploy this monorepo as two services/projects:

1. repository root → Next.js web project;
2. `music-connector/` → FastAPI connector project.

Set `MUSIC_CONNECTOR_INTERNAL_URL` in the web project to the connector URL and use the same high-entropy `MUSIC_CONNECTOR_INTERNAL_SECRET` / `INTERNAL_SECRET` pair. For a serious pilot, place the connector behind Vercel Firewall or a private service boundary in addition to the shared secret.

Provision PostgreSQL, run `npm run migrate`, register an official Yandex OAuth application, and set the exact production callback:

```text
https://YOUR_DOMAIN/auth/yandex/callback
```

Set `ADMIN_YANDEX_IDS` to exactly one Yandex profile ID, plus `ADMIN_LOGIN_USERNAME` and a scrypt value in `ADMIN_LOGIN_PASSWORD_HASH`. The admin page requires both the separate owner-password session and the single-entry Yandex allowlist. A regular Yandex ID session or stale `admin` role is not sufficient. There is no public admin preview or public navigation link.

The service-account Yandex Music token must belong to a dedicated pilot account—not a founder's personal account and not a creator's account. Connect it in **Admin → Система → Подключить сервис**. The token is encrypted before it reaches PostgreSQL and is never stored in browser state. The encrypted/plain environment variables remain a break-glass fallback for existing installations.

Create each celebrity from **Админка → Пригласить Саундмейкера**. This generates the only creator-registration path: a one-use invite URL that expires after seven days. After the creator uploads a profile photo, the owner downloads the prepared square image directly from that creator's card in the admin dashboard and uploads it once as the corresponding playlist cover while signed in to the service account. Track updates remain automatic; cover upload is manual because the supported community connector does not expose a reliable playlist-cover mutation.

Production automation has four layers: Google Cloud Scheduler calls the protected route every minute, GitHub Actions provides a five-minute recovery cycle and independent hourly watchdog, and Vercel Cron provides one daily recovery call. Active public profiles and the creator cabinet can also request a safe post-response sync. Every scheduler uses the same rotated `CRON_SECRET`; the primary job is `taste-yandex-history-sync` and calls `/api/cron/sync?source=gcp_scheduler`. This is polling rather than a real-time Yandex webhook, so publication follows the first successful poll after Yandex exposes the history event.

For Telegram digests, create a bot in BotFather and set `TELEGRAM_NOTIFICATIONS_ENABLED=true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and a random `TELEGRAM_WEBHOOK_SECRET`. Then open **Админка → Система** and run **Обновить Telegram-вебхук**. A fan must first sign in with Yandex ID and follow the tastemaker; Telegram linking is voluntary and per tastemaker. `/stop` disables all bot notifications. A single subscription uses the 20:00 Moscow slot; multiple subscriptions are spread into distinct, stable slots from 12:00 to 21:00 so one listener does not receive a burst. The system never sends more than one digest per tastemaker per Moscow calendar day, and only after that tastemaker's public playlist has caught up with the new stored history. Creator comments bypass the digest schedule and are delivered immediately.

## Required external setup before a real account test

- PostgreSQL `DATABASE_URL`;
- Yandex ID app client ID/secret and callback;
- the sole owner Yandex ID in `ADMIN_YANDEX_IDS` and separate password-gate variables;
- deployed connector + shared internal secret;
- dedicated Yandex Music service account authorized in the protected admin UI;
- a disposable/test tastemaker Yandex Music account;
- the working owner contact `camp@navumi.com` and approved creator consent copy;
- Telegram bot credentials and webhook setup if the notification experiment is enabled.

## Verification

```bash
npm run lint
npm run check:python
npm run build
```

The public UI and owner-login gate have been visually checked at desktop and 390px mobile widths. The build also enforces TypeScript, connector compilation and production Next.js compilation.
