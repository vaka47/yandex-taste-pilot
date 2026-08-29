from __future__ import annotations

import hashlib
from typing import Any

from yandex_music import Client

from .base import ConnectionResult, DeviceChallenge, MusicHistoryProvider


def _model_value(model: Any, name: str, default: Any = None) -> Any:
    return getattr(model, name, default) if model is not None else default


def _cover_url(track: Any) -> str | None:
    cover_uri = _model_value(track, "cover_uri")
    if not cover_uri:
        albums = _model_value(track, "albums", []) or []
        cover_uri = _model_value(albums[0], "cover_uri") if albums else None
    if not cover_uri:
        return None
    value = str(cover_uri).replace("%%", "400x400")
    return value if value.startswith("http") else f"https://{value}"


def _account(client: Client) -> dict[str, Any]:
    account = _model_value(_model_value(client, "me"), "account")
    return {
        "id": str(_model_value(account, "uid", _model_value(client, "account_uid", ""))),
        "login": _model_value(account, "login"),
        "displayName": _model_value(account, "display_name", _model_value(account, "full_name")),
    }


def _normalize_track(track: Any, day: str | None, position: int, occurrence_rank: int) -> dict[str, Any] | None:
    track_id = _model_value(track, "id")
    if track_id is None:
        return None
    albums = _model_value(track, "albums", []) or []
    album_id = _model_value(albums[0], "id") if albums else None
    artists = _model_value(track, "artists", []) or []
    artist_names = [str(_model_value(artist, "name", "")) for artist in artists if _model_value(artist, "name")]
    artist_ids = [str(_model_value(artist, "id")) for artist in artists if _model_value(artist, "id") is not None]
    # The list is newest-first and shifts whenever a new item arrives. Ranking repeated
    # track occurrences from the oldest end keeps earlier event keys stable across syncs.
    source_key = f"{day or 'unknown'}:{track_id}:{album_id or ''}:{occurrence_rank}"
    provider_event_key = hashlib.sha256(source_key.encode("utf-8")).hexdigest()
    return {
        "providerEventKey": provider_event_key,
        "trackProviderId": str(track_id),
        "albumProviderId": str(album_id) if album_id is not None else None,
        "trackTitle": str(_model_value(track, "title", "Unknown track")),
        "artistNames": artist_names,
        "artistProviderIds": artist_ids,
        "coverUrl": _cover_url(track),
        # The provider currently supplies a day and ordering, not a dependable played-at timestamp.
        # Keep observedAt null: callers must not invent clock precision.
        "observedAt": None,
        "observedDate": day,
        "providerPosition": position,
        "yandexUrl": f"https://music.yandex.ru/album/{album_id}/track/{track_id}" if album_id else f"https://music.yandex.ru/track/{track_id}",
    }


class YandexMusicProvider(MusicHistoryProvider):
    def start_connection(self, label: str | None = None) -> DeviceChallenge:
        client = Client()
        code = client.request_device_code(device_name=(label or "TastePilot")[:64])
        return DeviceChallenge(
            device_code=code.device_code,
            user_code=code.user_code,
            verification_url=code.verification_url,
            expires_in=int(code.expires_in),
            interval=max(5, int(code.interval or 5)),
        )

    def poll_connection(self, device_code: str) -> ConnectionResult:
        client = Client()
        token = client.poll_device_token(device_code)
        if token is None:
            return ConnectionResult(status="pending")
        authorized = Client(token.access_token).init()
        return ConnectionResult(
            status="connected",
            access_token=token.access_token,
            refresh_token=token.refresh_token,
            expires_in=int(token.expires_in) if token.expires_in else None,
            account=_account(authorized),
        )

    def validate_connection(self, token: str) -> dict[str, Any]:
        return _account(Client(token).init())

    def fetch_recent_history(self, token: str, full_models_count: int = 100) -> list[dict[str, Any]]:
        client = Client(token).init()
        history = client.music_history(full_models_count=max(1, min(full_models_count, 250)))
        if not history:
            return []
        entries: list[tuple[str | None, int, Any, Any]] = []
        missing_refs: list[str] = []
        position = 0
        for tab in history.history_tabs or []:
            day = _model_value(tab, "date")
            for group in _model_value(tab, "items", []) or []:
                for item in _model_value(group, "tracks", []) or []:
                    if _model_value(item, "type") != "track":
                        continue
                    data = _model_value(item, "data")
                    item_id = _model_value(data, "item_id")
                    track_id = _model_value(item_id, "track_id", _model_value(item_id, "id"))
                    album_id = _model_value(item_id, "album_id")
                    model = _model_value(data, "full_model")
                    entries.append((day, position, model, (track_id, album_id)))
                    if model is None and track_id is not None:
                        missing_refs.append(f"{track_id}:{album_id}" if album_id is not None else str(track_id))
                    position += 1

        resolved: dict[str, Any] = {}
        if missing_refs:
            for track in client.tracks(list(dict.fromkeys(missing_refs))) or []:
                resolved[str(_model_value(track, "id"))] = track

        occurrence_ranks: dict[int, int] = {}
        occurrence_counts: dict[tuple[str | None, str, str], int] = {}
        for day, item_position, _, ids in reversed(entries):
            track_id, album_id = ids
            key = (day, str(track_id), str(album_id or ""))
            occurrence_counts[key] = occurrence_counts.get(key, 0) + 1
            occurrence_ranks[item_position] = occurrence_counts[key]

        normalized: list[dict[str, Any]] = []
        for day, item_position, model, ids in entries:
            track_id, _ = ids
            track = model or resolved.get(str(track_id))
            item = _normalize_track(track, day, item_position, occurrence_ranks[item_position])
            if item:
                normalized.append(item)
        return normalized

    def sync_playlist(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = Client(token).init()
        uid = payload.get("uid") or str(client.account_uid)
        kind = payload.get("kind")
        title = payload.get("title") or "Taste — live"
        desired = payload.get("tracks") or []

        if kind is None:
            playlist = client.users_playlists_create(title=title, visibility="public", user_id=uid)
            if playlist is None:
                raise RuntimeError("PLAYLIST_CREATE_FAILED")
            kind = playlist.kind
        else:
            playlist = client.users_playlists(kind=kind, user_id=uid)
            if playlist is None:
                raise RuntimeError("PLAYLIST_FETCH_FAILED")

        current = [str(_model_value(_model_value(track_short, "track"), "id")) for track_short in (playlist.tracks or [])]
        revision = int(playlist.revision or 1)
        operations = 0

        for index, item in enumerate(desired):
            wanted = str(item["trackId"])
            if index < len(current) and current[index] == wanted:
                continue
            if wanted in current[index:]:
                found = current.index(wanted, index)
                playlist = client.users_playlists_delete_track(kind, found, found + 1, revision=revision, user_id=uid)
                if playlist is None:
                    raise RuntimeError("PLAYLIST_MUTATION_CONFLICT")
                revision = int(playlist.revision or revision + 1)
                current.pop(found)
                operations += 1
            playlist = client.users_playlists_insert_track(kind, item["trackId"], item["albumId"], at=index, revision=revision, user_id=uid)
            if playlist is None:
                raise RuntimeError("PLAYLIST_MUTATION_CONFLICT")
            revision = int(playlist.revision or revision + 1)
            current.insert(index, wanted)
            operations += 1

        if len(current) > len(desired):
            playlist = client.users_playlists_delete_track(kind, len(desired), len(current), revision=revision, user_id=uid)
            if playlist is None:
                raise RuntimeError("PLAYLIST_MUTATION_CONFLICT")
            revision = int(playlist.revision or revision + 1)
            operations += 1

        client.users_playlists_visibility(kind, "public", user_id=uid)
        return {
            "uid": str(uid),
            "kind": str(kind),
            "revision": revision,
            "trackCount": len(desired),
            "operations": operations,
            "publicUrl": f"https://music.yandex.ru/users/{uid}/playlists/{kind}",
        }
