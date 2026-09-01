# Pilot product decisions

## Public history gate

Anonymous visitors see the tastemaker's identity and aggregate activity, but no event row, track title or artist. Full history, repeat counts and first-seen signals require Yandex ID. The server returns zero events before authentication, so the boundary does not rely on hidden markup or obscured client data.

This is a value gate, not a follow wall. Authentication proves a distinct user and unlocks history; following is a separate explicit action. Only the “Следить” OAuth continuation finishes a follow automatically because the visitor already expressed that intent before leaving for Yandex.

## In-product playback

Not part of the celebrity pilot. The available history source does not provide audio, progress or rights to proxy a stream. Yandex supports an embeddable iframe, but it does not give Taste reliable first-party completion telemetry; introducing it now would blur the baseline between interest in the celebrity signal and use of an embedded player. Track and playlist links remain tracked first-party intent signals. Test an official embed later as a separate A/B experiment—never proxy or download audio through a creator token.

## Telegram retention

Included behind environment configuration. A fan may opt into multiple tastemakers, but receives at most one digest per tastemaker per Moscow day. Messages are sent only after the relevant live playlist has been updated. Each button uses a one-way random token, allowing delivery-to-click measurement without exposing the fan identity in the URL.

## History truth

Yandex decides whether a track appears in its history. Taste cannot submit an event after 60 seconds, accept a 50% play, recover a five-second skip or infer an exact played-at timestamp. The connector imports the day and ordering exactly as available and gives repeated occurrences stable keys from the oldest edge of the returned list.
