"""EGYM Wellpass – offizielle Standortdaten aus dem Wellpass-Gym-Finder.

Der Gym-Finder (https://de.egym-wellpass.com/de-de/gym-finder) lädt seine
Daten von ``https://gymfinder.int.api.egym.com/v1/gym/overview``. Diese
Schnittstelle ist nicht dokumentiert, und die robots.txt von
locations.egym.com untersagt automatisierte Zugriffe. Dieser Abruf ist daher
**nur auf ausdrücklichen Wunsch** aktiv (``--wellpass-official``). Er ist für
einen einmaligen, privaten Abgleich gedacht und nicht für regelmäßige
Automatisierung. Standardmäßig nutzt die Quelle „wellpass“ weiterhin
Fair for Fitness (siehe wellpass_fff.py).

Es wird genau eine Anfrage gestellt (Berlin, Radius 30 km). Das Antwortformat
stammt aus dem öffentlichen JavaScript des Gym-Finders:
``{"gyms": [{gymId, slug, alias, gymChainName, address: {street, streetNumber,
zipCode, city, country, coordinates: [lng, lat]}, website, phone, options:
{activities: [{activity}]}, qualitrainGym, …}]}``.
"""

from __future__ import annotations

import urllib.parse
from typing import Any, Callable

from ..http import FetchError, PoliteClient
from ..io import now_iso
from ..normalize import is_berlin_postal_code
from ..records import SOURCE_OFFICIAL, SourceRecord

API = "https://gymfinder.int.api.egym.com/v1/gym/overview"
CENTER = (52.5163, 13.3777)
RADIUS_M = 30000
HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "de-de",
    "Origin": "https://locations.egym.com",
    "Referer": "https://locations.egym.com/",
}


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_response(data: Any, fetched_at: str) -> list[SourceRecord]:
    gyms = data.get("gyms") if isinstance(data, dict) else data
    if not isinstance(gyms, list):
        raise FetchError("Wellpass (offiziell): unerwartetes Antwortformat – Liste 'gyms' fehlt")
    out: dict[str, SourceRecord] = {}
    for g in gyms:
        if not isinstance(g, dict):
            continue
        # Nur Studios des DACH-Wellpass-Netzes (früher Qualitrain)
        if g.get("qualitrainGym") is False:
            continue
        a = g.get("address") or {}
        pc = str(a.get("zipCode") or "").strip() or None
        city = a.get("city")
        if pc and not is_berlin_postal_code(pc):
            continue
        if not pc and not (city or "").lower().startswith("berlin"):
            continue
        lat = lng = None
        coords = a.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            lng, lat = _num(coords[0]), _num(coords[1])  # GeoJSON-Reihenfolge [lng, lat]
        if lat is None:
            lat, lng = _num(a.get("latitude")), _num(a.get("longitude"))
        street = " ".join(x for x in (a.get("street"), a.get("streetNumber")) if x) or None
        gid = str(g.get("gymId") or g.get("gymUUID") or g.get("slug") or "")
        name = (g.get("alias") or g.get("name") or "").strip()
        if not gid or not name:
            continue
        activities = [x.get("activity") for x in ((g.get("options") or {}).get("activities") or []) if isinstance(x, dict) and x.get("activity")]
        out[gid] = SourceRecord(
            provider="wellpass",
            source=SOURCE_OFFICIAL,
            sourceId=gid,
            name=name,
            street=street,
            postalCode=pc,
            city="Berlin",
            latitude=lat,
            longitude=lng,
            coordinatePrecision="source" if lat is not None else None,
            website=(g.get("website") or "").strip() or None,
            providerUrl="https://de.egym-wellpass.com/de-de/gym-finder",
            categories=[str(x).replace("_", " ").title() for x in activities],
            phone=(g.get("phone") or "").strip() or None,
            fetchedAt=fetched_at,
            extra={"chain": g.get("gymChainName")},
        )
    return list(out.values())


def fetch(client: PoliteClient, progress: Callable[[str], None], should_stop: Callable[[], bool]) -> list[SourceRecord]:
    if should_stop():
        raise InterruptedError
    progress("Wellpass: Abfrage beim offiziellen Gym-Finder (einmaliger Abgleich) …")
    qs = urllib.parse.urlencode(
        {"searchFilter": "wellpass", "limit": 20000, "latLong": f"{CENTER[0]};{CENTER[1]}", "radius": RADIUS_M}
    )
    data = client.get_json(f"{API}?{qs}", HEADERS)
    records = parse_response(data, now_iso())
    if not records:
        raise FetchError("Wellpass (offiziell): keine Berliner Studios erhalten")
    progress(f"Wellpass: {len(records)} Berliner Studios vom offiziellen Gym-Finder")
    return records
