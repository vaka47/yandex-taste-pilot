# Taste — Yandex Music Pilot

Production-oriented pilot for following the real, opt-in listening history of tastemakers. The web app is the measurement layer; one stable Yandex Music playlist per tastemaker is the delivery layer.

## Implemented

- public profile at `/t/[slug]` without login;
- Follow → official Yandex ID OAuth + PKCE → atomic pending-follow completion;
- secure `HttpOnly` sessions and DB-backed roles;
- one-use, seven-day creator invites issued only by the owner admin; successful registration burns every outstanding invite for that tastemaker, while ordinary Yandex ID sign-in always remains a fan account;
- creator invite claim, consent, pause/resume, publication delay, hide track/artist, disconnect and deletion request;
- creator-editable name, role line, bio and optional square avatar; avatar download is shown only to the authenticated owner on the public profile;
- operational admin actions, sync/audit logs, per-tastemaker profile/follow/music/share analytics and CSV export;
- tracked `/go/track/[id]` and `/go/playlist/[id]` redirects with an allowlisted Yandex destination;
- PostgreSQL migration and idempotent schema bootstrap;
- isolated FastAPI connector pinned to `yandex-music==3.0.0`;
- non-blocking Device Flow challenge/polling; music tokens never reach browser storage;
- real history import, privacy filtering, stable deduplication, zero delay by default and optional 24h publication delay;
- one chained history → latest-50 unique playlist sync through a dedicated service account, connected from the protected admin UI;
- automatic 5-minute checks by default, with creator-selectable 5/15/60-minute intervals and immediate playlist delivery after each successful history check;
- cron leases, normalized provider errors and per-tastemaker failure isolation;
- responsive public, admin and creator interfaces, reduced-motion support and visible keyboard focus;
- fixture mode for safe demos before accounts/secrets are connected.

## Important truth boundary

Yandex adds a track to listening history only after it has played to completion; there is no supported seconds threshold for Taste to configure. The current community API returns reliable day/order history but does not guarantee an exact listened-at timestamp for every event. The connector therefore emits `observedAt: null` when only day/order exists. The app must never invent clock precision.

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

Create each celebrity from **Админка → Пригласить тейстмейкера**. This generates the only creator-registration path: a one-use invite URL that expires after seven days. After the creator uploads a profile photo, the owner can open that public profile from the admin dashboard, download the prepared square image, and upload it once as the corresponding playlist cover while signed in to the service account. Track updates remain automatic; cover upload is manual because the supported community connector does not expose a reliable playlist-cover mutation.

On Vercel Hobby, one protected GitHub Actions workflow runs every five minutes. It chains history import and playlist delivery in the same request; the per-tastemaker lease applies a creator's 5/15/60-minute preference. Configure identical `CRON_SECRET` values in GitHub Actions and the web project, and set the GitHub `APP_URL` secret to the production origin. Vercel Pro may instead use native Cron Jobs.

## Required external setup before a real account test

- PostgreSQL `DATABASE_URL`;
- Yandex ID app client ID/secret and callback;
- the sole owner Yandex ID in `ADMIN_YANDEX_IDS` and separate password-gate variables;
- deployed connector + shared internal secret;
- dedicated Yandex Music service account authorized in the protected admin UI;
- a disposable/test tastemaker Yandex Music account;
- production privacy/deletion email and approved creator consent copy.

## Verification

```bash
npm run lint
npm run check:python
npm run build
```

The public UI and owner-login gate have been visually checked at desktop and 390px mobile widths. The build also enforces TypeScript, connector compilation and production Next.js compilation.
