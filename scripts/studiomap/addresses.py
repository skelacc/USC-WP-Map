"""Fehlende Adressangaben per Rückwärtssuche (Nominatim/OpenStreetMap).

Der Wellpass-Gym-Finder liefert nur Koordinaten, bei USC fehlen teils PLZ,
Bezirk oder Straße. Für Studios mit Lücken wird die OSM-Adresse an der
Position gesucht; ergänzt werden nur fehlende Felder. Die Ergebnisse
  * liegen in ``data/raw/osm_addresses.json`` (Zwischenspeicher, setzt fort),
  * werden erst NACH der Zusammenführung eingesetzt (verfälschen den Abgleich
    mit USC also nicht) und
  * sind als ungefähr gekennzeichnet (``address.approximate``).

Nominatim-Nutzungsrichtlinie: max. 1 Anfrage/Sekunde, eindeutiger User-Agent,
Ergebnisse zwischenspeichern. Daten © OpenStreetMap-Mitwirkende (ODbL).
"""

from __future__ import annotations

import re
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
    targets: list[tuple[str, float, float, str]],  # (Eintragsschlüssel, lat, lng, Name)
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


def load_cache(path) -> dict[str, Any]:
    """Zwischenspeicher, Schlüssel = Eintragsschlüssel (provider:source:id). Ältere
    Einträge (nur Wellpass-ID) werden übernommen."""
    from .io import read_json

    raw = read_json(path, {}) or {}
    return {(k if ":" in k else f"wellpass:official:{k}"): v for k, v in raw.items()}


def _hit_for(cache: dict[str, Any], key: str, lat: float | None, lng: float | None) -> dict | None:
    hit = cache.get(key)
    # nur, wenn die Position seit der Abfrage gleich geblieben ist
    if not hit or lat is None or lng is None or abs(lat - hit["lat"]) > 1e-4 or abs(lng - hit["lng"]) > 1e-4:
        return None
    return hit


def annotate_records(records: list, cache: dict[str, Any]) -> int:
    """Vor der Zusammenführung: ermittelte Adresse als Hinweis (extra.osmStreet) an
    Wellpass-Einträge ohne Straße hängen – der Abgleich wertet sie nur bei Übereinstimmung."""
    n = 0
    for r in records:
        if r.provider != "wellpass" or r.source != "official" or r.street:
            continue
        hit = _hit_for(cache, r.key, r.latitude, r.longitude)
        if hit and hit.get("street"):
            r.extra["osmStreet"] = hit["street"]
            n += 1
    return n


SEARCH = "https://nominatim.openstreetmap.org/search"


def geocode_key(r) -> str:
    return f"geo:{r.key}"


def geocode_targets(records: list) -> list:
    """Einträge ohne Koordinaten, aber mit Straße (z. B. USC-Studios außerhalb Berlins)."""
    return [r for r in records if r.latitude is None and r.street]


def _place(a: dict) -> str | None:
    return a.get("city") or a.get("town") or a.get("village") or a.get("municipality")


def geocode_records(records: list, cache: dict[str, Any], client: PoliteClient, progress: Callable[[str], None],
                    save: Callable[[dict], None]) -> list[str]:
    """Vorwärtssuche Adresse → Position für Einträge ohne Koordinaten (einmal je Eintrag).
    Strukturierte Suche; ein Treffer zählt nur, wenn PLZ bzw. Ort übereinstimmen –
    die freie Suche landet sonst bei gleichnamigen Straßen in anderen Städten."""
    errors: list[str] = []
    for r in geocode_targets(records):
        k = geocode_key(r)
        if k in cache:
            continue
        street = next((x.strip() for x in r.street.split(",") if any(ch.isdigit() for ch in x)), r.street)
        postal = r.postalCode or (r.extra.get("details") or {}).get("postalCode")  # USC: PLZ oft nur in den Details
        attempts: list[tuple[dict, Callable[[dict], bool]]] = []
        if postal:
            attempts.append(({"street": street, "postalcode": postal}, lambda a, pc=postal: a.get("postcode") == pc))
        # Ort aus dem Namen („Injoy Eberswalde“)
        for word in [w for w in re.findall(r"[A-ZÄÖÜ][\wäöüß-]{3,}", r.name)][1:] or re.findall(r"[A-ZÄÖÜ][\wäöüß-]{3,}", r.name)[-1:]:
            attempts.append(({"street": street, "city": word}, lambda a, w=word: (_place(a) or "").lower().startswith(w.lower())))
        hit = None
        for params, ok in attempts:
            url = SEARCH + "?" + urllib.parse.urlencode({**params, "country": "de", "format": "jsonv2", "limit": 1, "addressdetails": 1})
            try:
                res = client.get_json(url)
            except FetchError as e:
                errors.append(f"{r.name}: {e}")
                break
            if res and ok(res[0].get("address") or {}):
                a = res[0]["address"]
                hit = {"lat": round(float(res[0]["lat"]), 7), "lng": round(float(res[0]["lon"]), 7), "query": params,
                       "city": _place(a), "postalCode": a.get("postcode"), "fetchedAt": now_iso()}
                break
        if hit:
            cache[k] = hit
            progress(f"Position ermittelt: {r.name} → {hit['postalCode'] or ''} {hit['city']}")
        else:
            cache[k] = {"lat": None, "lng": None, "query": attempts[0][0] if attempts else None, "fetchedAt": now_iso()}
            errors.append(f"Keine gesicherte Position für {r.name} ({r.street}, {r.postalCode or 'ohne PLZ'})")
        save(cache)
    return errors


def apply_geocodes(records: list, cache: dict[str, Any]) -> int:
    """Vor der Zusammenführung: ermittelte Positionen einsetzen (als „geocoded“ = ungefähr).
    Liegt der Ort nicht in Berlin, werden falsche Berlin-Angaben der Quelle korrigiert."""
    n = 0
    for r in geocode_targets(records):
        hit = cache.get(geocode_key(r))
        if not hit or hit.get("lat") is None:
            continue
        r.latitude, r.longitude, r.coordinatePrecision = hit["lat"], hit["lng"], "geocoded"
        if hit.get("city") and hit["city"] != "Berlin" and (r.city or "Berlin") == "Berlin":
            r.city, r.district = hit["city"], None
        r.postalCode = r.postalCode or hit.get("postalCode")
        n += 1
    return n


def missing_fields(address: dict) -> list[str]:
    """Fehlende Adressangaben; Bezirk nur in Berlin (außerhalb gibt es keine)."""
    out = [f for f in ("street", "postalCode") if not address.get(f)]
    if not address.get("district") and address.get("city") in (None, "Berlin") and not address.get("region"):
        out.append("district")
    return out


def lookup_key(studio: dict) -> str | None:
    """Eintrag, dessen Position das Studio verwendet (dessen Koordinaten werden abgefragt)."""
    c = studio.get("coordinates")
    if not c:
        return None
    d = studio["providerDetails"].get(c.get("from")) or next(iter(studio["providerDetails"].values()), None)
    return d.get("key") if d else None


def apply_addresses(dataset: dict, cache: dict[str, Any]) -> int:
    """Ergänzt fehlende Straße, PLZ, Bezirk und Ort aus dem Zwischenspeicher – nur
    fehlende Felder. Eine so ergänzte Straße gilt als ungefähr (address.approximate)."""
    n = 0
    for s in dataset["studios"]:
        missing = missing_fields(s["address"])
        c = s.get("coordinates")
        key = lookup_key(s)
        if not missing or not c or not key:
            continue
        hit = _hit_for(cache, key, c["latitude"], c["longitude"])
        if not hit:
            continue
        a = dict(s["address"])
        if not a.get("street") and hit.get("street"):
            a["street"] = hit["street"]
            a["approximate"] = True
        if not a.get("postalCode") and hit.get("postalCode"):
            a["postalCode"] = hit["postalCode"]
        if hit.get("city") and (not a.get("city") or (a.get("city") == "Berlin" and a.get("region") and hit["city"] != "Berlin")):
            a["city"] = hit["city"]  # fehlt, oder „Berlin“ aus dem Slug, obwohl außerhalb (Bundesland gesetzt)
        if not a.get("district") and hit.get("district") and a.get("city") == "Berlin":
            a["district"] = hit["district"]
        if a == s["address"]:
            continue
        s["address"] = a
        d = next((x for x in s["providerDetails"].values() if x.get("key") == key), None)
        if d is not None:
            da = dict(d.get("address") or {})
            for f in ("street", "postalCode", "city", "district", "approximate"):
                if a.get(f) and not da.get(f):
                    da[f] = a[f]
            d["address"] = da
        n += 1
    # auch in den Zuordnungsvorschlägen anzeigen
    by_id = {s["id"]: s for s in dataset["studios"]}
    for cand in dataset.get("matchCandidates", []):
        for side in ("wellpass", "urbanSportsClub"):
            x = cand[side]
            st = by_id.get(x.get("studioId") or "")
            if not st:
                continue
            if not x.get("street") and st["address"].get("street"):
                x.update(street=st["address"]["street"], approximate=bool(st["address"].get("approximate")))
            if side == "wellpass" and not x.get("postalCode") and st["address"].get("postalCode"):
                x["postalCode"] = st["address"]["postalCode"]
    return n
