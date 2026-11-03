"""EGYM Wellpass – Berliner Partnerstudios über die öffentliche API von
Fair for Fitness (https://fair-for-fitness.de).

Warum nicht direkt bei Wellpass? Der offizielle Gym-Finder
(https://de.egym-wellpass.com/de-de/gym-finder) bettet
https://locations.egym.com/embed/web/wellpass ein. Deren robots.txt enthält
``Disallow: /`` für alle Agenten; eine dokumentierte öffentliche Schnittstelle
oder einen Export gibt es nicht. Automatisierte Abrufe dort unterbleiben daher.

Fair for Fitness stellt eine dokumentierte, schreibgeschützte Such-API bereit
(OpenAPI: https://fair-for-fitness.de/openapi.json). robots.txt erlaubt
``/api/search`` ausdrücklich; die Lizenzangabe lautet „Daten ohne Gewähr;
Nutzung mit Attribution + Link erlaubt“. Die Netzwerkzuordnung stammt von
Fair for Fitness (Drittquelle) und wird entsprechend gekennzeichnet.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Callable

from ..http import FetchError, PoliteClient
from ..io import now_iso
from ..normalize import is_berlin_postal_code
from ..records import SOURCE_THIRD_PARTY, SourceRecord

API = "https://fair-for-fitness.de/api/search"
# Mittelpunkt Berlins; 30 km decken das gesamte Stadtgebiet ab.
CENTER = (52.5163, 13.3777)
RADIUS_KM = 30


def _address_from_maps_url(url: str | None) -> tuple[str | None, str | None]:
    """Unbepreiste Pins enthalten keine Straße, aber eine Google-Maps-Such-URL
    der Form ``query=Name, Straße 1, 10115, Berlin``."""
    if not url:
        return None, None
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("query", [""])[0]
    parts = [p.strip() for p in q.split(",")]
    for i, p in enumerate(parts):
        if re.fullmatch(r"\d{5}", p) and i > 0:
            return parts[i - 1], p
    return None, None


def _is_berlin(city: str | None, postal_code: str | None) -> bool:
    if postal_code:
        return is_berlin_postal_code(postal_code)
    return bool(city) and city.strip().lower().startswith("berlin")


def parse_response(data: dict, fetched_at: str) -> list[SourceRecord]:
    if not isinstance(data, dict) or "results" not in data or "unpriced" not in data:
        raise FetchError("Fair for Fitness: unerwartetes Antwortformat")
    records: dict[str, SourceRecord] = {}

    for item in data["results"]:
        g = item.get("gym", {})
        networks = g.get("partnerNetworks")
        if networks is not None and "wellpass" not in networks:
            continue
        if not _is_berlin(g.get("city"), g.get("postalCode")):
            continue
        rec = SourceRecord(
            provider="wellpass",
            source=SOURCE_THIRD_PARTY,
            sourceId=g["id"],
            name=g.get("name", "").strip(),
            street=g.get("street"),
            postalCode=g.get("postalCode"),
            city="Berlin",
            latitude=g.get("lat"),
            longitude=g.get("lng"),
            coordinatePrecision="source" if g.get("lat") is not None else None,
            website=g.get("sourceUrl") or None,
            providerUrl=f"https://fair-for-fitness.de/studio/{g['slug']}" if g.get("slug") else None,
            categories=[g["kategorie"]] if g.get("kategorie") else [],
            phone=g.get("phone"),
            fetchedAt=fetched_at,
            extra={"chain": g.get("chain")},
        )
        records[rec.sourceId] = rec

    for u in data["unpriced"]:
        # Der Netzwerkfilter wirkt laut API-Doku auch auf preislose Pins.
        street, pc = _address_from_maps_url(u.get("googleMapsUrl"))
        if not _is_berlin(u.get("city"), pc):
            continue
        rec = SourceRecord(
            provider="wellpass",
            source=SOURCE_THIRD_PARTY,
            sourceId=u["id"],
            name=u.get("name", "").strip(),
            street=street,
            postalCode=pc,
            city="Berlin",
            latitude=u.get("lat"),
            longitude=u.get("lng"),
            coordinatePrecision="source" if u.get("lat") is not None else None,
            website=u.get("website") or None,
            categories=[u["kategorie"]] if u.get("kategorie") else [],
            phone=u.get("phone"),
            fetchedAt=fetched_at,
            extra={"chain": u.get("chain")},
        )
        records.setdefault(rec.sourceId, rec)
    return list(records.values())


def fetch(client: PoliteClient, progress: Callable[[str], None], should_stop: Callable[[], bool]) -> list[SourceRecord]:
    if should_stop():
        raise InterruptedError
    progress("Wellpass: Abfrage bei Fair for Fitness …")
    qs = urllib.parse.urlencode({"lat": CENTER[0], "lng": CENTER[1], "radius": RADIUS_KM, "networks": "wellpass", "country": "DE"})
    data = client.get_json(f"{API}?{qs}")
    records = parse_response(data, now_iso())
    if not records:
        raise FetchError("Wellpass: keine Studios erhalten")
    progress(f"Wellpass: {len(records)} Berliner Studios erhalten")
    return records
