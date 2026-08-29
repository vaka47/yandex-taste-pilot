# First-party analytics contract

Allowlisted events:

- acquisition: `tastemaker_profile_view`, `share_click`;
- follow: `follow_click`, `auth_started`, `auth_completed`, `follow_completed`, `unfollow_completed`;
- music intent: `track_open_click`, `playlist_open_click`;
- retention input: `following_page_view` and profile views.

Anonymous identity uses a random first-party cookie, not fingerprinting. Yandex ID login may associate subsequent events with an internal user ID. Redirect routes record music-intent server-side before returning `302`.

Recommended D7 definition: first profile-visit cohort on Day 0; retained when a qualifying Taste view occurs on calendar days 6–8. Keep visitor and follower cohorts separate.

Never label an outbound click as `stream`, `play`, `listen` or completed playback.

