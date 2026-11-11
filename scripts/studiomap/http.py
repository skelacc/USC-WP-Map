"""Höflicher HTTP-Client: fester User-Agent, Pausen zwischen Anfragen,
begrenzte Wiederholungen, Zeitlimit. Nur Standardbibliothek."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

USER_AGENT = "FitnessStudioMapBerlin/1.0 (private, non-commercial; low-frequency import)"


class FetchError(RuntimeError):
    pass


class PoliteClient:
    def __init__(self, delay: float = 1.5, timeout: float = 30.0, retries: int = 3):
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self._last = 0.0
        self.requests = 0

    def _wait(self) -> None:
        elapsed = time.monotonic() - self._last
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

    def get(self, url: str, headers: dict[str, str] | None = None) -> str:
        last_err: Exception | None = None
        for attempt in range(1, self.retries + 1):
            self._wait()
            # Abstand zählt ab Beginn der Anfrage: höchstens 1 Anfrage je `delay` Sekunden
            self._last = time.monotonic()
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    self.requests += 1
                    return resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                last_err = e
                # 4xx (außer 429) nicht wiederholen
                if 400 <= e.code < 500 and e.code != 429:
                    break
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last_err = e
            time.sleep(min(2**attempt, 16))
        raise FetchError(f"Abruf fehlgeschlagen: {url} ({last_err})")

    def get_json(self, url: str, headers: dict[str, str] | None = None) -> Any:
        text = self.get(url, headers)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise FetchError(f"Antwort ist kein gültiges JSON: {url} ({e})") from e
