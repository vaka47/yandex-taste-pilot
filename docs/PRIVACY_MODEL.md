# Privacy model

Fan Yandex ID and creator Yandex Music access are separate authorizations.

- Fan OAuth identifies a Taste account and never reads the fan's music.
- Creator Device Flow is experimental, explicit and revocable.
- Access/refresh tokens are encrypted at rest and server-only.
- Public queries require `visibility='public'` and `publish_at <= now()`.
- Pause disables publication and playlist writes.
- Hidden tracks/artists disappear from public reads and the next playlist sync.
- Disconnect clears encrypted credentials and stops sync.
- Deletion requests are audit logged for admin-assisted completion.

The connector is unofficial and must not be presented as a Yandex partnership or endorsement.
