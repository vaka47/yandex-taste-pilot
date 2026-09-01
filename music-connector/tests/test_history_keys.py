from __future__ import annotations

import sys
import unittest
from pathlib import Path


CONNECTOR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CONNECTOR_ROOT))

from app.providers.history_keys import occurrence_ranks_from_oldest, stable_event_key


class HistoryKeyTests(unittest.TestCase):
    def keys(self, entries: list[tuple[str | None, int, str, str]]) -> dict[int, str]:
        ranks = occurrence_ranks_from_oldest(entries)
        return {
            position: stable_event_key(day, track_id, album_id, ranks[position])
            for day, position, track_id, album_id in entries
        }

    def test_new_repeat_does_not_change_existing_occurrence_keys(self) -> None:
        previous = [("2026-09-01", 0, "42", "7"), ("2026-09-01", 1, "42", "7")]
        current = [("2026-09-01", 0, "42", "7"), ("2026-09-01", 1, "42", "7"), ("2026-09-01", 2, "42", "7")]

        previous_keys = set(self.keys(previous).values())
        current_keys = set(self.keys(current).values())

        self.assertTrue(previous_keys.issubset(current_keys))
        self.assertEqual(len(current_keys - previous_keys), 1)

    def test_different_days_never_collapse(self) -> None:
        entries = [("2026-09-01", 0, "42", "7"), ("2026-08-31", 1, "42", "7")]
        keys = self.keys(entries)
        self.assertNotEqual(keys[0], keys[1])

    def test_album_is_part_of_identity(self) -> None:
        first = stable_event_key("2026-09-01", "42", "7", 1)
        second = stable_event_key("2026-09-01", "42", "8", 1)
        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
