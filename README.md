# Taste — Yandex Music Pilot

Production-oriented pilot for following the real, opt-in listening history of tastemakers. The web app is the measurement layer; one stable Yandex Music playlist per tastemaker is the delivery layer.

## Implemented

- public profile at `/t/[slug]` without login;
- Follow → official Yandex ID OAuth + PKCE → atomic pending-follow completion;
- secure `HttpOnly` sessions and DB-backed roles;
- creator invite claim, consent, pause/resume, publication delay, hide track/artist, disconnect and deletion request;
- operational admin actions, sync/audit logs, first-party funnel/intent/retention UI and CSV export;
- tracked `/go/track/[id]` and `/go/playlist/[id]` redirects with an allowlisted Yandex destination;
- PostgreSQL migration and idempotent schema bootstrap;
- isolated FastAPI connector pinned to `yandex-music==3.0.0`;
- non-blocking Device Flow challenge/polling; music tokens never reach browser storage;
- real history import, privacy filtering, stable deduplication and 0/24h publication delay;
- stable latest-50 unique playlist sync through a dedicated service account;
- cron leases, normalized provider errors and per-tastemaker failure isolation;
- responsive public, admin and creator interfaces, reduced-motion support and visible keyboard focus;
- fixture mode for safe demos before accounts/secrets are connected.

## Important truth boundary

The current community API returns reliable day/order history but does not guarantee an exact listened-at timestamp for every event. The connector therefore emits `observedAt: null` when only day/order exists. The app must never invent clock precision.

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

The service-account Yandex Music token must belong to a dedicated pilot account—not a founder's personal account. Prefer `SERVICE_YANDEX_MUSIC_TOKEN_ENCRYPTED`.

## Required external setup before a real account test

- PostgreSQL `DATABASE_URL`;
- Yandex ID app client ID/secret and callback;
- first admin Yandex ID in `ADMIN_YANDEX_IDS`;
- deployed connector + shared internal secret;
- dedicated Yandex Music service account token;
- a disposable/test tastemaker Yandex Music account;
- production privacy/deletion email and approved creator consent copy.

## Verification

```bash
npm run lint
npm run check:python
npm run build
```

The UI has been visually checked at desktop and 390px mobile widths. Public, admin-preview, creator-preview, Follow interstitial, Pause and Device Flow challenge states were exercised in-browser.

