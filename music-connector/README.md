# Taste Music Connector

Isolated FastAPI adapter around `MarshalX/yandex-music-api` v3.0.0.

It exposes only server-to-server endpoints protected by `X-Internal-Secret`. Music tokens are accepted in request bodies from the trusted web backend and are never returned except once during the protected Device Flow poll. Do not route this service directly to browsers.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
INTERNAL_SECRET=local-secret uvicorn app.main:app --reload --port 8000
```

The provider intentionally keeps `observedAt=null` when Yandex Music supplies only day + ordering. The web app must not fabricate exact listening times.

