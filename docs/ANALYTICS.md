# First-party analytics contract

Allowlisted events:

- acquisition: `tastemaker_profile_view`, `share_click`, `history_unlock_click`, `history_unlocked_view`;
- follow: `follow_click`, `auth_started`, `auth_completed`, `follow_completed`, `unfollow_completed`;
- music intent: `track_open_click`, `playlist_open_click`;
- Telegram retention: `telegram_connect_click`, `telegram_connected`, `telegram_disconnected`, `telegram_notification_click`;
- retention input: `following_page_view`, authenticated history views and profile views.

Anonymous identity uses a random first-party cookie, not fingerprinting. Yandex ID login may associate subsequent events with an internal user ID. Redirect routes record music-intent server-side before returning `302`.

Recommended D7 definition: first profile-visit cohort on Day 0; retained when a qualifying Taste view occurs on calendar days 6–8. Incomplete cohorts are excluded. Visitor D7 and follower D7 are calculated separately.

Never label an outbound click as `stream`, `play`, `listen` or completed playback.

The funnel is intentionally separated into page view → history unlock → explicit follow → Yandex Music click → Telegram opt-in → Telegram click. Anonymous visitors see identity and aggregate activity but no track identity; the complete event list is withheld server-side. This keeps acquisition measurable without deceptively auto-following users at login.

Telegram delivery state (`queued`, `sent`, `failed`, `clicked`) is stored separately from behavioural events and can be exported by the owner through `kind=telegram`. Historical notification links routed through Taste can have the `clicked` state. New music buttons intentionally use the official `music.yandex.ru` playlist or track URL directly so iOS Universal Links and Android App Links can open the exact destination in the installed Yandex Music app. Telegram's Bot API does not let an ordinary URL button both report the click to Taste and open an arbitrary external destination, so direct music-button clicks are not counted. Profile links inside the notification remain measurable through first-party page-view analytics.
