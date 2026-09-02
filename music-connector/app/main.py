from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from yandex_music.exceptions import DeviceAuthError, NetworkError, YandexMusicError

from .providers.base import MusicHistoryProvider
from .providers.yandex_music import YandexMusicProvider


app = FastAPI(title="Taste Music Connector", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
provider: MusicHistoryProvider = YandexMusicProvider()


def require_internal_secret(x_internal_secret: str = Header(default="")) -> None:
    expected = os.environ.get("INTERNAL_SECRET", "")
    if not expected or not hmac.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def provider_error(error: Exception) -> HTTPException:
    message = str(error).lower()
    if isinstance(error, DeviceAuthError):
        code = "DEVICE_FLOW_EXPIRED" if "expired" in message or "timed out" in message else "AUTH_REVOKED" if "denied" in message else "AUTH_EXPIRED"
    elif "429" in message or "rate" in message:
        code = "RATE_LIMITED"
    elif "revision" in message or "conflict" in message:
        code = "PLAYLIST_MUTATION_CONFLICT"
    elif isinstance(error, NetworkError):
        code = "HISTORY_FETCH_FAILED"
    elif isinstance(error, YandexMusicError):
        code = "UNKNOWN_PROVIDER_ERROR"
    else:
        code = str(error) if str(error).isupper() else "UNKNOWN_PROVIDER_ERROR"
    # Never include provider bodies or credentials in the public error detail.
    return HTTPException(status_code=502, detail=code, headers={"x-taste-error-code": code})


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=lambda value: value.split("_")[0] + "".join(part.title() for part in value.split("_")[1:]))


class StartRequest(CamelModel):
    label: str | None = Field(default=None, max_length=64)


class PollRequest(CamelModel):
    device_code: str = Field(min_length=8, max_length=2048)


class TokenRequest(CamelModel):
    token: str = Field(min_length=16, max_length=8192)


class HistoryRequest(TokenRequest):
    full_models_count: int = Field(default=100, ge=1, le=250)


class PlaylistRequest(TokenRequest):
    uid: str | None = None
    kind: str | None = None
    title: str = Field(default="Taste — live", max_length=200)
    tracks: list[dict[str, Any]] = Field(default_factory=list, max_length=50)


class PlaylistDeleteRequest(TokenRequest):
    uid: str = Field(min_length=1, max_length=80)
    kind: str = Field(min_length=1, max_length=80)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "provider": "yandex_music_unofficial", "library": "yandex-music==3.0.0"}


@app.post("/internal/yandex-music/device/start", dependencies=[Depends(require_internal_secret)])
def start_device_flow(body: StartRequest) -> dict[str, Any]:
    try:
        challenge = provider.start_connection(body.label)
        return {"deviceCode": challenge.device_code, "userCode": challenge.user_code, "verificationUrl": challenge.verification_url, "expiresIn": challenge.expires_in, "interval": challenge.interval}
    except Exception as error:
        raise provider_error(error) from None


@app.post("/internal/yandex-music/device/poll", dependencies=[Depends(require_internal_secret)])
def poll_device_flow(body: PollRequest) -> dict[str, Any]:
    try:
        result = provider.poll_connection(body.device_code)
        return {"status": result.status, "accessToken": result.access_token, "refreshToken": result.refresh_token, "expiresIn": result.expires_in, "account": result.account}
    except Exception as error:
        raise provider_error(error) from None


@app.post("/internal/yandex-music/validate", dependencies=[Depends(require_internal_secret)])
def validate_connection(body: TokenRequest) -> dict[str, Any]:
    try:
        return {"account": provider.validate_connection(body.token)}
    except Exception as error:
        raise provider_error(error) from None


@app.post("/internal/yandex-music/history/fetch", dependencies=[Depends(require_internal_secret)])
def fetch_history(body: HistoryRequest) -> dict[str, Any]:
    try:
        return {"events": provider.fetch_recent_history(body.token, body.full_models_count)}
    except Exception as error:
        raise provider_error(error) from None


@app.post("/internal/yandex-music/playlist/sync", dependencies=[Depends(require_internal_secret)])
def sync_playlist(body: PlaylistRequest) -> dict[str, Any]:
    try:
        payload = body.model_dump(by_alias=True, exclude={"token"})
        return provider.sync_playlist(body.token, payload)
    except Exception as error:
        raise provider_error(error) from None


@app.post("/internal/yandex-music/playlist/delete", dependencies=[Depends(require_internal_secret)])
def delete_playlist(body: PlaylistDeleteRequest) -> dict[str, Any]:
    try:
        deleted = provider.delete_playlist(body.token, body.uid, body.kind)
        if not deleted:
            raise RuntimeError("PLAYLIST_DELETE_FAILED")
        return {"deleted": True}
    except Exception as error:
        raise provider_error(error) from None
