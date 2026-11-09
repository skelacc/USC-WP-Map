"""Adressen für Wellpass-Studios ohne Adresse – per Rückwärtssuche (Nominatim/OpenStreetMap).

Der Wellpass-Gym-Finder liefert nur Koordinaten. Für Studios, die weder über
USC noch über Fair for Fitness eine Adresse haben, wird die nächstgelegene
OSM-Adresse zur Position gesucht. Die Ergebnisse
  * liegen in ``data/raw/wellpass_addresses.json`` (Zwischenspeicher, setzt fort),
  * werden erst NACH der Zusammenführung eingesetzt (verfälschen den Abgleich
    mit USC also nicht) und
  * sind als ungefähr gekennzeichnet (``address.approximate``).

Nominatim-Nutzungsrichtlinie: max. 1 Anfrage/Sekunde, eindeutiger User-Agent,
Ergebnisse zwischenspeichern. Daten © OpenStreetMap-Mitwirkende (ODbL).
"""

from __future__ import annotations

import urllib.parse
from typing import Any, Callable

from .http import FetchError, PoliteClient
from .io import now_iso
from .normalize import haversine_m

REVERSE = "https://nominatim.openstreetmap.org/reverse"
# Liegt die gefundene Adresse weiter weg, wird nur die Straße übernommen (ohne Hausnummer)
MAX_HOUSE_DISTANCE_M = 75


def parse_reverse(res: Any, lat: float, lng: float) -> dict[str, Any] | None:
    if not isinstance(res, dict) or "address" not in res:
        return None
    a = res["address"]
    road = a.get("road") or a.get("pedestrian") or a.get("footway") or a.get("path") or a.get("square") or a.get("park")
    if not road:
        return None
    try:
        dist = haversine_m(lat, lng, float(res["lat"]), float(res["lon"]))
    except (KeyError, TypeError, ValueError):
        dist = None
    number = a.get("house_number") if dist is not None and dist <= MAX_HOUSE_DISTANCE_M else None
    return {
        "street": f"{road} {number}" if number else road,
        "postalCode": a.get("postcode"),
        "district": a.get("borough") or a.get("city_district"),
        "suburb": a.get("suburb"),
        "city": a.get("city") or a.get("town") or a.get("village"),
        "place": res.get("name") or None,  # benanntes Objekt an der Stelle (zur Kontrolle)
        "distanceM": round(dist) if dist is not None else None,
    }


def fetch_addresses(
    targets: list[tuple[str, float, float, str]],
    cache: dict[str, Any],
    client: PoliteClient,
    progress: Callable[[str], None],
    should_stop: Callable[[], bool],
    save: Callable[[dict], None],
) -> tuple[dict[str, Any], list[str]]:
    """targets: (sourceId, lat, lng, name). Bereits gespeicherte werden übersprungen."""
    todo = [t for t in targets if t[0] not in cache]
    errors: list[str] = []
    progress(f"Adressen: {len(todo)} von {len(targets)} Studios abzufragen (ca. {len(todo) * 1.1 / 60:.0f} Min.)")
    for i, (sid, lat, lng, name) in enumerate(todo, 1):
        if should_stop():
            save(cache)
            raise InterruptedError
        url = REVERSE + "?" + urllib.parse.urlencode(
            {"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1, "zoom": 18, "accept-language": "de"}
        )
        try:
            res = client.get_json(url)
        except FetchError as e:
            errors.append(f"{name}: {e}")
            continue
        cache[sid] = {**(parse_reverse(res, lat, lng) or {"street": None}), "lat": lat, "lng": lng, "fetchedAt": now_iso()}
        if i % 25 == 0 or i == len(todo):
            save(cache)
            progress(f"Adressen: {i}/{len(todo)} – zuletzt {name}: {cache[sid].get('street') or 'keine Adresse'}")
    save(cache)
    return cache, errors


def _hit_for(cache: dict[str, Any], sid: str, lat: float | None, lng: float | None) -> dict | None:
    hit = cache.get(sid)
    # nur, wenn die Position seit der Abfrage gleich geblieben ist
    if not hit or not hit.get("street") or lat is None or lng is None or abs(lat - hit["lat"]) > 1e-4 or abs(lng - hit["lng"]) > 1e-4:
        return None
    return hit


def annotate_records(records: list, cache: dict[str, Any]) -> int:
    """Vor der Zusammenführung: ermittelte Adresse als Hinweis (extra.osmStreet) an
    Wellpass-Einträge ohne Straße hängen – der Abgleich wertet sie nur bei Übereinstimmung."""
    n = 0
    for r in records:
        if r.provider != "wellpass" or r.source != "official" or r.street:
            continue
        hit = _hit_for(cache, r.sourceId, r.latitude, r.longitude)
        if hit:
            r.extra["osmStreet"] = hit["street"]
            n += 1
    return n


def apply_addresses(dataset: dict, cache: dict[str, Any]) -> int:
    """Setzt gespeicherte Adressen bei Wellpass-Studios ohne Straße ein. Liefert die Anzahl."""
    n = 0
    for s in dataset["studios"]:
        d = s["providerDetails"].get("wellpass")
        if not d or d.get("source") != "official" or s["address"].get("street"):
            continue
        c = s.get("coordinates") or {}
        hit = _hit_for(cache, d["sourceId"], c.get("latitude"), c.get("longitude"))
        if not hit:
            continue
        addr = {
            **s["address"],
            "street": hit["street"],
            "postalCode": s["address"].get("postalCode") or hit.get("postalCode"),
            "district": s["address"].get("district") or hit.get("district"),
            "city": s["address"].get("city") or hit.get("city"),
            "approximate": True,
        }
        s["address"] = addr
        d["address"] = {**(d.get("address") or {}), **{k: addr[k] for k in ("street", "postalCode", "district", "approximate")}}
        n += 1
    return n
