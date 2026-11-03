"""Urban Sports Club – Berliner Standorte von der öffentlichen Website.

Es gibt keine dokumentierte öffentliche API. Die öffentlich zugängliche
Seite https://urbansportsclub.com/de/venues lädt ihre Daten selbst über
zwei Anfragen nach, die hier in gleicher Form (ohne Login) gestellt werden:

* ``/de/studios-map?city_id=1&plan_type=N`` – JSON mit Name, Slug,
  Adress-ID und Koordinaten aller Standorte, die in Tarifstufe N nutzbar sind.
* ``/de/venues?city_id=1&plan_type=6&page=N`` – paginierte Ergebnisliste
  (HTML-Fragment) mit Straße, Bezirk und Sportarten.

robots.txt von urbansportsclub.com sperrt diese Pfade nicht (gesperrt sind
nur /membership, /reservations, /account). Der Import arbeitet mit
Pausen zwischen den Anfragen und ist für seltene, manuelle Aktualisierung
gedacht. Ändert USC die Seite, schlägt der Import mit klarer Meldung fehl
und der bisherige Datenbestand bleibt erhalten.
"""

from __future__ import annotations

import html
import re
from typing import Callable

from ..http import FetchError, PoliteClient
from ..io import now_iso
from ..records import SOURCE_OFFICIAL, SourceRecord

BASE = "https://urbansportsclub.com"
BERLIN_CITY_ID = 1
PLAN_TYPES = {1: "Essential", 2: "Classic", 3: "Premium", 6: "Max"}
XHR = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
MAX_PAGES = 250

_SNIPPET = re.compile(r'<div\s+class="smm-studio-snippet b-studio-item"\s+data-address-id="(\d+)"(.*?)(?=<div\s+class="smm-studio-snippet b-studio-item"|\Z)', re.S)


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_list_fragment(fragment: str) -> dict[str, dict]:
    """Parst ein HTML-Fragment der Ergebnisliste. Schlüssel: Adress-ID."""
    out: dict[str, dict] = {}
    for m in _SNIPPET.finditer(fragment):
        address_id, body = m.group(1), m.group(2)
        slug = re.search(r'href="/de/venues/([^"]+)"', body)
        title = re.search(r'smm-studio-snippet__studio-link[^>]*>(.*?)</a>', body, re.S)
        disc = re.search(r'<div class="disciplines">(.*?)</div>', body, re.S)
        addr = re.search(r'<p class="smm-studio-snippet__address">\s*(.*?)<span class="smm-studio-snippet__address-street">(.*?)</span>', body, re.S)
        district = street = None
        if addr:
            district = _clean(addr.group(1)).rstrip(",").strip() or None
            street = _clean(addr.group(2)) or None
        categories = [c.strip() for c in _clean(disc.group(1)).split("·")] if disc else []
        out[address_id] = {
            "slug": slug.group(1) if slug else None,
            "name": _clean(title.group(1)) if title else None,
            "district": district,
            "street": street,
            "categories": [c for c in categories if c],
        }
    return out


def fetch(client: PoliteClient, progress: Callable[[str], None], should_stop: Callable[[], bool]) -> list[SourceRecord]:
    fetched_at = now_iso()

    # 1) Koordinaten + Tarifstufen
    plan_sets: dict[str, set[str]] = {}
    venues: dict[str, dict] = {}
    for plan_id, plan_name in PLAN_TYPES.items():
        if should_stop():
            raise InterruptedError
        progress(f"USC: Kartendaten für Tarifstufe {plan_name} …")
        data = client.get_json(f"{BASE}/de/studios-map?city_id={BERLIN_CITY_ID}&plan_type={plan_id}", XHR)
        if not isinstance(data, dict) or not data.get("success") or "venues" not in data.get("data", {}):
            raise FetchError("USC: unerwartetes Format der Kartendaten (Seite geändert?)")
        ids: set[str] = set()
        for v in data["data"]["venues"]:
            if v.get("cityId") != BERLIN_CITY_ID:
                continue
            aid = str(v["addressId"])
            ids.add(aid)
            venues[aid] = v
        plan_sets[plan_name] = ids
    if not venues:
        raise FetchError("USC: keine Standorte erhalten")

    # 2) Adressen + Sportarten aus der Ergebnisliste
    details: dict[str, dict] = {}
    for page in range(1, MAX_PAGES + 1):
        if should_stop():
            raise InterruptedError
        data = client.get_json(f"{BASE}/de/venues?city_id={BERLIN_CITY_ID}&plan_type=6&page={page}", XHR)
        content = (data or {}).get("data", {}).get("content", "") if isinstance(data, dict) else ""
        parsed = parse_list_fragment(content)
        details.update(parsed)
        progress(f"USC: Ergebnisliste Seite {page} ({len(details)} Adressen)")
        if not parsed or not data["data"].get("showMore"):
            break

    records: list[SourceRecord] = []
    all_ids = set(venues) | set(details)
    for aid in sorted(all_ids, key=int):
        v = venues.get(aid, {})
        d = details.get(aid, {})
        loc = v.get("location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        slug = v.get("slug") or d.get("slug")
        records.append(
            SourceRecord(
                provider="urbanSportsClub",
                source=SOURCE_OFFICIAL,
                sourceId=aid,
                name=(v.get("name") or d.get("name") or "").strip(),
                street=d.get("street"),
                postalCode=None,  # nicht in den öffentlichen Listen enthalten
                city="Berlin",
                district=d.get("district"),
                latitude=round(lat, 7) if isinstance(lat, (int, float)) else None,
                longitude=round(lng, 7) if isinstance(lng, (int, float)) else None,
                coordinatePrecision="source" if lat is not None else None,
                providerUrl=f"{BASE}/de/venues/{slug}" if slug else None,
                categories=d.get("categories", []),
                plans=[p for p in PLAN_TYPES.values() if aid in plan_sets.get(p, set())],
                fetchedAt=fetched_at,
            )
        )
    return records
