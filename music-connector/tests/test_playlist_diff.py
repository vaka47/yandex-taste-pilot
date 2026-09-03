import json
import unittest

from app.providers.playlist_diff import build_replace_diff


class PlaylistDiffTests(unittest.TestCase):
    def test_replaces_existing_playlist_in_two_operations(self) -> None:
        raw, operations = build_replace_diff(7, [
            {"trackId": "11", "albumId": "101"},
            {"trackId": 12, "albumId": 102},
        ])
        self.assertEqual(operations, 2)
        self.assertEqual(json.loads(raw), [
            {"op": "delete", "from": 0, "to": 7},
            {"op": "insert", "at": 0, "tracks": [
                {"id": "11", "albumId": "101"},
                {"id": "12", "albumId": "102"},
            ]},
        ])

    def test_empty_playlist_needs_only_insert(self) -> None:
        raw, operations = build_replace_diff(0, [{"trackId": "11", "albumId": "101"}])
        self.assertEqual(operations, 1)
        self.assertEqual(json.loads(raw)[0]["op"], "insert")

    def test_empty_target_deletes_existing_tracks(self) -> None:
        raw, operations = build_replace_diff(2, [])
        self.assertEqual(operations, 1)
        self.assertEqual(json.loads(raw), [{"op": "delete", "from": 0, "to": 2}])


if __name__ == "__main__":
    unittest.main()
