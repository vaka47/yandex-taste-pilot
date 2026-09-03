from __future__ import annotations

import json
from typing import Any


def build_replace_diff(current_count: int, tracks: list[dict[str, Any]]) -> tuple[str, int]:
    """Build one atomic playlist change instead of one request per track."""
    operations: list[dict[str, Any]] = []
    if current_count > 0:
        operations.append({"op": "delete", "from": 0, "to": current_count})
    if tracks:
        operations.append({
            "op": "insert",
            "at": 0,
            "tracks": [
                {"id": str(track["trackId"]), "albumId": str(track["albumId"])}
                for track in tracks
            ],
        })
    return json.dumps(operations, ensure_ascii=False, separators=(",", ":")), len(operations)
