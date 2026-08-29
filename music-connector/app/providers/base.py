from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DeviceChallenge:
    device_code: str
    user_code: str
    verification_url: str
    expires_in: int
    interval: int


@dataclass(frozen=True)
class ConnectionResult:
    status: str
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    account: dict[str, Any] | None = None


class MusicHistoryProvider(ABC):
    @abstractmethod
    def start_connection(self, label: str | None = None) -> DeviceChallenge:
        raise NotImplementedError

    @abstractmethod
    def poll_connection(self, device_code: str) -> ConnectionResult:
        raise NotImplementedError

    @abstractmethod
    def validate_connection(self, token: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def fetch_recent_history(self, token: str, full_models_count: int = 100) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def sync_playlist(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

