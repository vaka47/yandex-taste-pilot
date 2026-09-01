from __future__ import annotations

import hashlib
from collections.abc import Iterable


def occurrence_ranks_from_oldest(
    entries: Iterable[tuple[str | None, int, str | int | None, str | int | None]],
) -> dict[int, int]:
    """Rank equal track occurrences from the oldest edge of a newest-first history.

    Yandex history has day-level precision and no playback event id. Counting from
    the oldest returned edge means inserting a new occurrence at position zero does
    not change keys already stored for the same day and track.
    """
    values = list(entries)
    ranks: dict[int, int] = {}
    counts: dict[tuple[str | None, str, str], int] = {}
    for day, position, track_id, album_id in reversed(values):
        key = (day, str(track_id), str(album_id or ""))
        counts[key] = counts.get(key, 0) + 1
        ranks[position] = counts[key]
    return ranks


def stable_event_key(
    day: str | None,
    track_id: str | int,
    album_id: str | int | None,
    occurrence_rank: int,
) -> str:
    source_key = f"{day or 'unknown'}:{track_id}:{album_id or ''}:{occurrence_rank}"
    return hashlib.sha256(source_key.encode("utf-8")).hexdigest()
