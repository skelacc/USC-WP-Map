"""Urban Sports Club – Details je Studio von der öffentlichen Studioseite
(``/de/venues/<slug>``; laut robots.txt nicht gesperrt).

Ergänzt die Standortliste um Angaben, die nur dort stehen:
* **Plus**: Studio ist als „Plus“ gekennzeichnet (Plus-Check-in nötig)
* Besuchslimits je Stufe (S/M/L/XL) und Kategorie-Limits (z. B. Massage 1/Monat)
* PLZ, Telefon, Bewertung (schema.org-Daten der Seite)
* Leistungsarten (Kurse / freies Training), Leistungen mit Plus-Kennzeichen

Abgerufen wird die von der Seite selbst genutzte, schlanke Datenantwort
(Header ``RSC: 1``, ~100 KB statt ~250 KB HTML). Ergebnisse werden in
``data/raw/usc_details.json`` zwischengespeichert; ein erneuter Lauf holt nur
fehlende oder ältere Einträge (Standard: älter als 30 Tage).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from ..http import FetchError, PoliteClient
from ..io import now_iso

BASE = "https://urbansportsclub.com/de/venues/"
# Version des gespeicherten Formats – ältere Einträge werden beim nächsten Lauf neu geholt
SCHEMA = 2


def _unescape_rsc(text: str) -> str:
    # Im RSC-Format stehen eingebettete JSON-Strings teils escaped (\")
    return text.replace('\\"', '"')


def _balanced(text: str, start: int) -> str | None:
    """Gibt das JSON-Objekt/-Array ab Position start (auf { oder [) zurück."""
    open_ch = text[start]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _json_after(text: str, key: str) -> Any:
    i = text.find(f'"{key}":')
    if i < 0:
        return None
    j = i + len(key) + 3
    while j < len(text) and text[j] in " \n":
        j += 1
    if j >= len(text) or text[j] not in "[{":
        return None
    raw = _balanced(text, j)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


_STR = r'"((?:[^"\\]|\\.)*)"'


def _text_after_heading(raw: str, heading: str) -> str | None:
    """Text des ersten mehrzeiligen Textblocks nach einer Überschrift
    (z. B. „Wichtige Infos“, „Öffnungszeiten“) im RSC-Format."""
    for src in (raw, raw.replace('\\"', '"')):
        i = src.find(f'"children":"{heading}"}}')
        if i < 0:
            continue
        m = re.search(r'"className":"[^"]*whitespace-pre-line[^"]*","children":' + _STR, src[i : i + 6000])
        if m:
            try:
                return json.loads(f'"{m.group(1)}"').strip() or None
            except json.JSONDecodeError:
                return m.group(1).replace("\\n", "\n").strip() or None
    return None


def parse_venue_page(text: str) -> dict[str, Any]:
    t = _unescape_rsc(text)
    out: dict[str, Any] = {}

    out["plus"] = '"data-testid":"plus-badge"' in t or 'data-testid="plus-badge"' in t
    out["plusServices"] = len(re.findall(r'"isPlusCheckin":true', t))

    ld: Any = None
    m = re.search(r'\{"@context":"https://schema\.org","@type":"SportsActivityLocation".*?</script>', t, re.S)
    raw_ld = None
    if m:
        raw_ld = m.group(0)[: -len("</script>")]
    else:
        k = t.find('"@type":"SportsActivityLocation"')
        if k > 0:
            s = t.rfind("{", 0, k)
            raw_ld = _balanced(t, s)
    if raw_ld:
        try:
            ld = json.loads(raw_ld)
        except json.JSONDecodeError:
            ld = None
    if isinstance(ld, dict):
        # vollständige schema.org-Daten der Seite (Beschreibung steht separat)
        out["ld"] = {k: v for k, v in ld.items() if k != "description"}
        addr = ld.get("address") or {}
        out["name"] = ld.get("name")
        out["street"] = addr.get("streetAddress")
        out["postalCode"] = addr.get("postalCode")
        out["phone"] = ld.get("telephone")
        geo = ld.get("geo") or {}
        out["lat"], out["lng"] = geo.get("latitude"), geo.get("longitude")
        if ld.get("description"):
            out["description"] = str(ld["description"]).strip()
        same = ld.get("sameAs")
        if isinstance(same, list) and same:
            out["website"] = same[0]
        elif isinstance(same, str):
            out["website"] = same
        img = ld.get("image")
        if isinstance(img, list) and img:
            img = img[0]
        if isinstance(img, dict):
            img = img.get("url")
        if isinstance(img, str):
            out["image"] = img
        rating = ld.get("aggregateRating") or {}
        if rating.get("ratingValue") is not None:
            out["rating"] = rating.get("ratingValue")
            out["ratingCount"] = rating.get("reviewCount")

    limits = _json_after(t, "venueLimits")
    if isinstance(limits, dict) and isinstance(limits.get("b2e"), list):
        out["limitsB2e"] = [
            {
                "plan": p.get("planName"),
                "size": p.get("name"),
                "included": bool(p.get("isProvidedByVenue")),
                "perMonth": p.get("monthlyLimitVenue"),
                "perMonthThisAddress": p.get("monthlyLimitVenueAddress"),
                "categories": [{"name": c.get("name"), "perMonth": c.get("limit")} for c in (p.get("categoryLimits") or [])],
            }
            for p in limits["b2e"]
            if isinstance(p, dict)
        ]
    if isinstance(limits, dict) and isinstance(limits.get("b2c"), list):
        out["limits"] = [
            {
                "plan": p.get("planName"),
                "size": p.get("name"),
                "included": bool(p.get("isProvidedByVenue")),
                "perMonth": p.get("monthlyLimitVenue"),
                "perMonthThisAddress": p.get("monthlyLimitVenueAddress"),
                "categories": [{"name": c.get("name"), "perMonth": c.get("limit")} for c in (p.get("categoryLimits") or [])],
            }
            for p in limits["b2c"]
            if isinstance(p, dict)
        ]
    out["serviceTypes"] = sorted(set(re.findall(r'"serviceType":"([a-z_]+)"', t)))
    # Angebote aus dem Zeitplan (Stichprobe der nächsten Tage), je Titel+Kategorie einmal
    acts = None
    k = t.find('"activities":{"classes"')
    if k >= 0:
        raw_acts = _balanced(t, k + len('"activities":'))
        try:
            acts = json.loads(raw_acts) if raw_acts else None
        except json.JSONDecodeError:
            acts = None
    services: dict[str, dict[str, Any]] = {}
    if isinstance(acts, dict):
        for kind in ("classes", "freeTrainings"):
            for c in acts.get(kind) or []:
                if not isinstance(c, dict):
                    continue
                title = (c.get("title") or "").strip()
                cat = (c.get("category") or {}).get("name")
                key = f"{title}|{cat}"
                if not title or key in services:
                    continue
                flags = c.get("flags") or {}
                services[key] = {
                    "title": title,
                    "category": cat,
                    "type": c.get("serviceType"),
                    "booking": c.get("bookingType"),
                    "b2c": c.get("planTypesB2C"),
                    "b2b": c.get("planTypesB2B"),
                    "plus": bool(flags.get("isPlusCheckin")),
                    "online": bool(flags.get("isOnline")),
                }
    if services:
        out["services"] = list(services.values())
    m = re.search(r'"venueId":(\d+)', t)
    if m:
        out["venueId"] = int(m.group(1))
    info = _text_after_heading(text, "Wichtige Infos")
    if info:
        out["importantInfo"] = info
    hours = _text_after_heading(text, "Öffnungszeiten")
    if hours:
        out["openingHours"] = hours
    return out


def _stale(entry: dict, max_age_days: int) -> bool:
    if entry.get("schema", 1) < SCHEMA:
        return True
    try:
        ts = datetime.fromisoformat(entry["fetchedAt"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return True
    return datetime.now(timezone.utc) - ts > timedelta(days=max_age_days)


def fetch_details(
    slugs: list[str],
    cache: dict[str, dict],
    client: PoliteClient,
    progress: Callable[[str], None],
    should_stop: Callable[[], bool],
    save: Callable[[dict[str, dict]], None],
    max_age_days: int = 90,
) -> tuple[dict[str, dict], list[str]]:
    todo = [s for s in slugs if s not in cache or _stale(cache[s], max_age_days)]
    errors: list[str] = []
    progress(f"USC-Details: {len(todo)} von {len(slugs)} Studioseiten abzurufen")
    for n, slug in enumerate(todo, 1):
        if should_stop():
            save(cache)
            raise InterruptedError
        try:
            text = client.get(BASE + slug, {"RSC": "1"})
            info = parse_venue_page(text)
            if not info.get("limits") and not info.get("street"):
                # Fallback: normale HTML-Seite
                info = parse_venue_page(client.get(BASE + slug))
            info["fetchedAt"] = now_iso()
            info["schema"] = SCHEMA
            cache[slug] = info
        except FetchError as e:
            errors.append(f"{slug}: {e}")
        if n % 25 == 0:
            save(cache)
            progress(f"USC-Details: {n}/{len(todo)}")
    save(cache)
    return cache, errors
