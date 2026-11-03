"""Optionale Geokodierung über Nominatim (OpenStreetMap) – nur für Datensätze
ohne Koordinaten und nur auf ausdrücklichen Wunsch (``--geocode``).

Ermittelte Positionen werden als ``coordinatePrecision = "geocoded"``
gekennzeichnet und in der Oberfläche als ungefähr ausgewiesen.
Nominatim-Nutzungsrichtlinie: max. 1 Anfrage/Sekunde, eindeutiger User-Agent.
"""

from __future__ import annotations

import urllib.parse
from typing import Callable

from .http import FetchError, PoliteClient
from .records import SourceRecord


def geocode_missing(records: list[SourceRecord], progress: Callable[[str], None]) -> list[str]:
    client = PoliteClient(delay=1.1)
    errors = []
    for r in records:
        if r.latitude is not None or not r.street:
            continue
        q = ", ".join(x for x in (r.street, r.postalCode, r.city or "Berlin") if x)
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "jsonv2", "limit": 1, "countrycodes": "de"}
        )
        try:
            res = client.get_json(url)
        except FetchError as e:
            errors.append(f"Geokodierung fehlgeschlagen für {r.name}: {e}")
            continue
        if res:
            r.latitude = round(float(res[0]["lat"]), 7)
            r.longitude = round(float(res[0]["lon"]), 7)
            r.coordinatePrecision = "geocoded"
            progress(f"Geokodiert: {r.name}")
        else:
            errors.append(f"Keine Position gefunden für {r.name} ({q})")
    return errors
